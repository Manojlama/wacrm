-- ============================================================
-- 040_saaS_billing_system.sql — Subscription, billing & audit
--
-- Extends the existing accounts-based multi-tenant architecture
-- with SaaS subscription management. Does NOT create a new
-- organizations table — builds on the existing accounts table.
--
-- New tables:
--   plans                  — Configurable subscription plans
--   subscriptions          — Customer subscriptions
--   subscription_events    — Razorpay webhook event log (idempotent)
--   invoices               — Payment invoices
--   usage_records          — Usage tracking for entitlements
--   audit_logs             — Audit trail for sensitive actions
--
-- Extends:
--   accounts               — Adds subscription_status, plan, trial, Razorpay IDs
-- ============================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
    CREATE TYPE subscription_status_enum AS ENUM (
      'trialing', 'active', 'past_due', 'grace_period',
      'suspended', 'cancelled', 'expired'
    );
  END IF;
END $$;

-- ============================================================
-- PLANS
-- Configurable from admin panel. Prices in paise (INR).
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  monthly_price INTEGER NOT NULL DEFAULT 0,
  yearly_price INTEGER NOT NULL DEFAULT 0,
  max_agents INTEGER NOT NULL DEFAULT 1,
  max_contacts INTEGER NOT NULL DEFAULT 1000,
  max_broadcasts INTEGER NOT NULL DEFAULT 100,
  max_automations INTEGER NOT NULL DEFAULT 5,
  max_whatsapp_numbers INTEGER NOT NULL DEFAULT 1,
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  advanced_automation BOOLEAN NOT NULL DEFAULT FALSE,
  support_level TEXT NOT NULL DEFAULT 'email',
  razorpay_plan_id_monthly TEXT,
  razorpay_plan_id_yearly TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Plans are readable by anyone (for pricing page), but only admins can modify
CREATE POLICY plans_select ON plans FOR SELECT USING (TRUE);
CREATE POLICY plans_insert ON plans FOR INSERT WITH CHECK (FALSE);
CREATE POLICY plans_update ON plans FOR UPDATE USING (FALSE);
CREATE POLICY plans_delete ON plans FOR DELETE USING (FALSE);

DROP TRIGGER IF EXISTS set_updated_at ON plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUBSCRIPTIONS
-- One active subscription per account at a time.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status subscription_status_enum NOT NULL DEFAULT 'trialing',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_plan_id TEXT,
  trial_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  grace_period_ends_at TIMESTAMPTZ,
  failed_payment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_sub ON subscriptions(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON subscriptions(trial_ends_at)
  WHERE status = 'trialing';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Members can read their own subscription
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (is_account_member(account_id));
-- Only service-role can modify (via webhooks/admin API)
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT
  WITH CHECK (TRUE);
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE
  USING (TRUE);

DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUBSCRIPTION_EVENTS
-- Idempotent Razorpay webhook event log.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_account ON subscription_events(account_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Only service-role can access webhook events
-- No client policies = service-role only access

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  billing_reason TEXT,
  invoice_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (TRUE);
CREATE POLICY invoices_update ON invoices FOR UPDATE
  USING (TRUE);

-- ============================================================
-- USAGE_RECORDS
-- Tracks usage for entitlement enforcement.
-- Reset monthly. Atomic increments via RPC.
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_account_metric ON usage_records(account_id, metric);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_records_select ON usage_records FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY usage_records_insert ON usage_records FOR INSERT
  WITH CHECK (TRUE);
CREATE POLICY usage_records_update ON usage_records FOR UPDATE
  USING (TRUE);

DROP TRIGGER IF EXISTS set_updated_at ON usage_records;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usage_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUDIT_LOGS
-- Immutable append-only log of sensitive actions.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON audit_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Members can read their own account's audit logs
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (account_id IS NOT NULL AND is_account_member(account_id));
-- Only service-role can insert (no client INSERT policy)
-- No UPDATE or DELETE policies — immutable

-- ============================================================
-- EXTEND ACCOUNTS TABLE
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS subscription_status subscription_status_enum DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS current_plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_accounts_subscription_status ON accounts(subscription_status);

-- ============================================================
-- SEED DEFAULT PLANS
-- ============================================================
INSERT INTO plans (name, display_name, description, monthly_price, yearly_price,
  max_agents, max_contacts, max_broadcasts, max_automations, max_whatsapp_numbers,
  ai_enabled, api_enabled, advanced_automation, support_level, sort_order)
VALUES
  ('starter', 'Starter', 'Perfect for small teams getting started with WhatsApp CRM',
    99900, 999000, 2, 1000, 100, 5, 1, FALSE, FALSE, FALSE, 'email', 1),
  ('growth', 'Growth', 'For growing teams that need more power and automation',
    249900, 2499000, 5, 5000, 500, 20, 2, TRUE, FALSE, TRUE, 'priority', 2),
  ('pro', 'Pro', 'For established teams requiring advanced features and API access',
    499900, 4999000, 15, 25000, 2000, 100, 3, TRUE, TRUE, TRUE, 'priority', 3),
  ('agency', 'Agency', 'For agencies managing multiple clients and large volumes',
    999900, 9999000, 50, 100000, 10000, 500, 10, TRUE, TRUE, TRUE, 'dedicated', 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- RPC: increment_usage
-- Atomically increments a usage counter for the current period.
-- ============================================================
CREATE OR REPLACE FUNCTION increment_usage(
  p_account_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_new_count INTEGER;
BEGIN
  -- Current billing period (monthly)
  v_period_start := date_trunc('month', NOW());
  v_period_end := (date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')::TIMESTAMPTZ;

  INSERT INTO usage_records (account_id, metric, count, period_start, period_end)
  VALUES (p_account_id, p_metric, p_increment, v_period_start, v_period_end)
  ON CONFLICT (account_id, metric, period_start)
  DO UPDATE SET count = usage_records.count + p_increment
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

ALTER FUNCTION increment_usage(UUID, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;

-- ============================================================
-- RPC: get_usage
-- Returns current usage count for a metric.
-- ============================================================
CREATE OR REPLACE FUNCTION get_usage(
  p_account_id UUID,
  p_metric TEXT
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count, 0)
  FROM usage_records
  WHERE account_id = p_account_id
    AND metric = p_metric
    AND period_start = date_trunc('month', NOW());
$$;

ALTER FUNCTION get_usage(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_usage(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- RPC: record_audit_log
-- Inserts an audit log entry. Called from service-role code.
-- ============================================================
CREATE OR REPLACE FUNCTION record_audit_log(
  p_account_id UUID,
  p_actor_user_id UUID,
  p_actor_email TEXT,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO audit_logs (account_id, actor_user_id, actor_email, action, resource_type, resource_id, details, ip_address)
  VALUES (p_account_id, p_actor_user_id, p_actor_email, p_action, p_resource_type, p_resource_id, p_details, p_ip_address)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION record_audit_log(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION record_audit_log(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT) TO service_role;

-- ============================================================
-- RPC: create_subscription
-- Creates or updates a subscription for an account.
-- ============================================================
CREATE OR REPLACE FUNCTION create_subscription(
  p_account_id UUID,
  p_plan_id UUID,
  p_billing_cycle TEXT DEFAULT 'monthly',
  p_razorpay_customer_id TEXT DEFAULT NULL,
  p_razorpay_subscription_id TEXT DEFAULT NULL,
  p_trial_days INTEGER DEFAULT 14
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id UUID;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  v_trial_ends := NOW() + (p_trial_days || ' days')::INTERVAL;

  -- Deactivate any existing active subscriptions
  UPDATE subscriptions
  SET status = 'cancelled', cancelled_at = NOW()
  WHERE account_id = p_account_id
    AND status IN ('trialing', 'active', 'past_due', 'grace_period');

  -- Create new subscription
  INSERT INTO subscriptions (account_id, plan_id, billing_cycle, razorpay_customer_id,
    razorpay_subscription_id, razorpay_plan_id, trial_ends_at, current_period_start, current_period_end)
  VALUES (p_account_id, p_plan_id, p_billing_cycle, p_razorpay_customer_id,
    p_razorpay_subscription_id, p_razorpay_subscription_id, v_trial_ends, NOW(), v_trial_ends)
  RETURNING id INTO v_sub_id;

  -- Update account
  UPDATE accounts
  SET subscription_status = 'trialing',
      current_plan_id = p_plan_id,
      trial_ends_at = v_trial_ends,
      razorpay_customer_id = COALESCE(p_razorpay_customer_id, razorpay_customer_id)
  WHERE id = p_account_id;

  RETURN v_sub_id;
END;
$$;

ALTER FUNCTION create_subscription(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION create_subscription(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role, authenticated;
