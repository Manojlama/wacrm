-- ============================================================
-- 043_add_cashfree_gateway.sql — second payment gateway
--
-- Adds Cashfree as an alternative to Razorpay. Each account can
-- choose its billing provider (`billing_provider` on accounts),
-- and all provider-specific ids are stored in dedicated columns
-- on subscriptions / plans / invoices so a single account can be
-- billed by exactly one provider.
--
-- Design choices:
--   * `billing_provider` is a TEXT column with a CHECK constraint
--     (matching the existing `billing_cycle` pattern) rather than a
--     Postgres enum — adding a third provider later is a single
--     ALTER on the constraint, no enum migration.
--   * Existing rows keep `billing_provider = 'razorpay'`, so this
--     migration is a strict no-op upgrade for current accounts.
--   * Cashfree amounts are rupee-units in its PG API, while the
--     app stores paise (migration 040). Conversion happens in the
--     Cashfree client (src/lib/subscriptions/cashfree.ts), not here.
-- ============================================================

-- ------------------------------------------------------------
-- ACCOUNTS — chosen gateway + optional Cashfree customer id
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'razorpay'
    CHECK (billing_provider IN ('razorpay', 'cashfree'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS cashfree_customer_id TEXT;

-- ------------------------------------------------------------
-- PLANS — per-provider plan ids
-- ------------------------------------------------------------
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS cashfree_plan_id_monthly TEXT,
  ADD COLUMN IF NOT EXISTS cashfree_plan_id_yearly TEXT;

-- ------------------------------------------------------------
-- SUBSCRIPTIONS — provider + Cashfree ids (two subscriptions,
-- one global account switch, so provider is denormalised here too)
-- ------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'razorpay'
    CHECK (billing_provider IN ('razorpay', 'cashfree'));

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cashfree_customer_id TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cashfree_subscription_id TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cashfree_plan_id TEXT;

-- Webhook lookups resolve cashfree_subscription_id → local row.
CREATE INDEX IF NOT EXISTS idx_subscriptions_cashfree_sub
  ON subscriptions(cashfree_subscription_id);

-- ------------------------------------------------------------
-- INVOICES — which gateway produced the row + Cashfree payment
-- ------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT 'razorpay'
    CHECK (gateway IN ('razorpay', 'cashfree'));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cashfree_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_cashfree_payment
  ON invoices(cashfree_payment_id);