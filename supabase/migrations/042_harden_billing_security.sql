-- ============================================================
-- 042_harden_billing_security.sql
--
-- Closes authorization gaps in the Phase 2 (migration 040) billing
-- surface, found during the Phase 9 security audit.
--
-- 1. SECURITY DEFINER functions default to PUBLIC EXECUTE in
--    Postgres. Every other sensitive RPC in this project explicitly
--    REVOKEs from PUBLIC before granting narrowly (see 007, 018,
--    019, 030, 037, 038, 041), but the four 040 functions never did
--    — so anon/authenticated could invoke them despite the narrow
--    GRANT lines. The REVOKEs below remove those defaults, then
--    EXECUTE is re-granted minimally (all four are invoked only from
--    server-side service-role clients, so nothing functional changes):
--      * increment_usage      → service_role (unchanged intent)
--      * get_usage            → service_role ONLY (removes the
--        "authenticated" grant: every in-app caller uses the
--        service-role admin client — src/lib/subscriptions/
--        entitlements.ts getUsage()). Blocks an authenticated user
--        probing any account's per-metric counters.
--      * record_audit_log     → service_role (unchanged intent)
--      * create_subscription  → service_role ONLY (removes the
--        "authenticated" grant: a signed-in user could otherwise
--        self-provision ANY plan or arbitrary trial length,
--        bypassing Razorpay entirely — all legit paths go through
--        owner-gated server routes: trial, checkout, webhook).
--
--    NOTE: handle_new_user is intentionally untouched. It runs as a
--    trigger on auth.users invoked by supabase_auth_admin, which has
--    EXECUTE only via the default PUBLIC grant — revoking PUBLIC
--    would break signup.
--
-- 2. subscriptions / invoices / usage_records had client INSERT and
--    UPDATE RLS policies of `TRUE`, letting any authenticated user
--    forge subscription/invoice rows for any account, or zero /
--    inflate their own usage counters (defeating Phase 7 limit
--    enforcement). Only the service role legitimately writes these
--    tables, and service_role bypasses RLS anyway — replace the
--    permissive policies with deny-all ones.
-- ============================================================

-- 1. Revoke PUBLIC + clients from the Phase 2 billing RPCs
REVOKE ALL ON FUNCTION increment_usage(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION get_usage(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_usage(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION record_audit_log(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_audit_log(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT) TO service_role;

REVOKE ALL ON FUNCTION create_subscription(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_subscription(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;

-- 2. Harden transactional-table RLS — deny client writes
DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (FALSE);
DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (FALSE);
DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS usage_records_insert ON usage_records;
CREATE POLICY usage_records_insert ON usage_records FOR INSERT WITH CHECK (FALSE);
DROP POLICY IF EXISTS usage_records_update ON usage_records;
CREATE POLICY usage_records_update ON usage_records FOR UPDATE USING (FALSE);