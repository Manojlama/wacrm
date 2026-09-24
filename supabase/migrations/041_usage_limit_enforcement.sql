-- ============================================================
-- 041_usage_limit_enforcement.sql — Backend-enforced plan caps
--
-- Phase 7 of the SaaS rollout. Entitlement enforcement must be
-- authoritative at the database, not just in API routes:
--
--   * `contacts` rows are inserted directly by client components
--     (contact form, CSV import) via RLS-scoped inserts, so a
--     route-only guard could be bypassed. A BEFORE INSERT trigger
--     is the authoritative backstop and maintains the account's
--     `usage_records[contacts]` counter in the same statement.
--
--   * Members join an account through the SECURITY DEFINER
--     `redeem_invitation` RPC (behavior defined in migration 019),
--     which MOVES the caller's profile row rather than inserting a
--     new one — so agent caps are enforced atomically inside the
--     RPC, before the move commits, and the counter is bumped only
--     when the admission succeeds.
--
-- Metrics that are only ever written through API routes
-- (broadcasts sends, automations, whatsapp_numbers) are guarded in
-- the route code with `canCreate*` + `increment_usage` — no
-- trigger needed.
--
-- Encodings:
--   * Every denial raises `USAGE_LIMIT_REACHED` so TS can detect
--     the case from the error message and map it to a clean 403.
--   * The trigger does an atomic increment-then-check: if the
--     raised cap is exceeded the RAISE aborts the INSERT statement,
--     which rolls the counter bump back too — no over-counting.
-- ============================================================

-- ============================================================
-- Shared cap resolver
-- Resolves a plan's cap column for an account, falling back to the
-- starter plan when the account has no plan yet (early signup /
-- legacy) so every account is enforced. NULL only when no plans
-- are seeded at all (defensive; treat as "unlimited").
-- SECURITY DEFINER so RLS never blocks the trigger or RPC from
-- reading accounts/plans.
-- ============================================================
CREATE OR REPLACE FUNCTION public.plan_cap_for_account(
  p_account_id UUID,
  p_cap_column TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_cap INTEGER;
BEGIN
  SELECT current_plan_id INTO v_plan_id
    FROM public.accounts
   WHERE id = p_account_id;

  IF v_plan_id IS NOT NULL THEN
    EXECUTE format('SELECT %I FROM public.plans WHERE id = $1', p_cap_column)
      INTO v_cap
      USING v_plan_id;
  END IF;

  IF v_cap IS NULL THEN
    EXECUTE format(
      'SELECT %I FROM public.plans WHERE name = ''starter'' AND is_active ORDER BY sort_order LIMIT 1',
      p_cap_column
    ) INTO v_cap;
  END IF;

  RETURN v_cap;
END;
$$;

ALTER FUNCTION public.plan_cap_for_account(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.plan_cap_for_account(UUID, TEXT) FROM PUBLIC;

-- ============================================================
-- Trigger function: enforce_usage_cap()
-- Generic BEFORE INSERT guard for client-written tables. Usage:
--   CREATE TRIGGER t BEFORE INSERT ON <table> FOR EACH ROW
--     EXECUTE FUNCTION enforce_usage_cap('<metric>', '<cap_column>');
-- On the first period row it self-seeds the counter with the
-- pre-existing row count (+1 for the incoming row) so the counter
-- converges on reality for legacy accounts that predate migration
-- 040. Denials raise `USAGE_LIMIT_REACHED` after the atomic bump,
-- aborting the statement (and rolling the bump back).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_usage_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metric TEXT := TG_ARGV[0];
  v_cap_column TEXT := TG_ARGV[1];
  v_account_id UUID := NEW.account_id;
  v_cap INTEGER;
  v_new_count INTEGER;
  v_period_start TIMESTAMPTZ := date_trunc('month', NOW());
  v_period_end TIMESTAMPTZ :=
    (date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second');
BEGIN
  v_cap := public.plan_cap_for_account(v_account_id, v_cap_column);
  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.usage_records
    (account_id, metric, count, period_start, period_end)
  SELECT NEW.account_id, v_metric, COUNT(*) + 1, v_period_start, v_period_end
    FROM public.contacts
   WHERE account_id = NEW.account_id
  ON CONFLICT (account_id, metric, period_start)
  DO UPDATE SET count = usage_records.count + 1
  RETURNING count INTO v_new_count;

  IF v_new_count > v_cap THEN
    RAISE EXCEPTION
      'USAGE_LIMIT_REACHED: % quota exhausted (at % of %); upgrade your plan to increase the limit',
      v_metric, v_new_count, v_cap;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_usage_cap() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_usage_cap() FROM PUBLIC;

-- ============================================================
-- CONTACTS — authoritative cap on direct (RLS) client inserts.
-- ============================================================
DROP TRIGGER IF EXISTS contacts_usage_cap ON public.contacts;
CREATE TRIGGER contacts_usage_cap
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_usage_cap('contacts', 'max_contacts');

-- ============================================================
-- redeem_invitation — agent cap, enforced atomically.
-- Re-declares the migration-019 function unchanged except:
--   * reads the plan's max_agents for the target account,
--   * atomic increment-then-check against usage_records[agents]
--     self-seeding from the existing member count, and
--   * raises `USAGE_LIMIT_REACHED` before the profile UPDATE when
--     the account is already at its member cap — the RISE aborts
--     this RPC's transaction, so the member is NOT admitted and
--     the counter bump is rolled back.
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID  -- the joined account_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
  v_agent_cap INTEGER;
  v_new_agent_count INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Caller's current account + its owner.
  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    -- Defensive — every authenticated user has a profile post-017.
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  -- Edge case: the inviter sent themselves a link, or the
  -- caller is somehow already in the inviter's account.
  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  -- Safety: the caller must be the SOLE OWNER of their current
  -- account (i.e. their fresh personal account from signup or a
  -- prior removal). Any other state means they're either:
  --   - a member of another shared account (joining a second
  --     would silently orphan their access to the first), or
  --   - the owner of an account with teammates (they'd abandon
  --     their team to join the inviter's).
  -- Either way, the safe answer is "make a different login".
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Belt: even if they own their account, refuse if it has any
  -- domain data — joining would orphan their contacts, deals,
  -- broadcasts, automations, flows, templates, etc.
  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- SaaS guard: enforce the target account's agent cap before
  -- admitting the member. Atomic increment-then-check; on denial
  -- the RAISE rolls back this whole RPC transaction (profile
  -- move, invite accept, orphan-account delete all undone).
  v_agent_cap := public.plan_cap_for_account(v_inv.account_id, 'max_agents');
  IF v_agent_cap IS NOT NULL THEN
    INSERT INTO public.usage_records
      (account_id, metric, count, period_start, period_end)
    SELECT v_inv.account_id, 'agents', COUNT(*) + 1,
           date_trunc('month', NOW()),
           (date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')
      FROM public.profiles
     WHERE account_id = v_inv.account_id
    ON CONFLICT (account_id, metric, period_start)
    DO UPDATE SET count = usage_records.count + 1
    RETURNING count INTO v_new_agent_count;

    IF v_new_agent_count > v_agent_cap THEN
      RAISE EXCEPTION
        'USAGE_LIMIT_REACHED: agents quota exhausted (at % of %); upgrade your plan to add more members',
        v_new_agent_count, v_agent_cap
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Move the profile first so the cascade-on-delete of the old
  -- account doesn't try to nuke this user's profile too.
  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Clean up the orphan personal account. Empty by the checks
  -- above, so this is purely housekeeping — no cascades fire
  -- because no other rows reference it.
  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;