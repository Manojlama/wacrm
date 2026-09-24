import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveSubscription, getPlans } from "@/lib/subscriptions/plans";
import { getUsageSnapshot } from "@/lib/subscriptions/entitlements";
import { getGatewayStatus } from "@/lib/subscriptions/gateway";

export const runtime = "nodejs";

/**
 * GET /api/billing
 * Returns the customer's full billing snapshot for the billing page:
 * current plan, subscription status, next billing date, usage, invoices,
 * and the full active plan catalog for the upgrade/downgrade grid.
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const admin = supabaseAdmin();

    const [active, usage, plans] = await Promise.all([
      getActiveSubscription(ctx.accountId),
      getUsageSnapshot(ctx.accountId),
      getPlans(),
    ]);

    const { data: invoices, error: invErr } = await admin
      .from("invoices")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (invErr) {
      console.error("[billing] invoices fetch failed:", invErr);
    }

    const { data: auditEvents, error: auditErr } = await admin
      .from("audit_logs")
      .select("action, created_at, details")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (auditErr) {
      console.error("[billing] audit fetch failed:", auditErr);
    }

    const { data: account } = await admin
      .from("accounts")
      .select("billing_provider")
      .eq("id", ctx.accountId)
      .maybeSingle();

    return NextResponse.json({
      subscription: active?.subscription ?? null,
      plan: active?.plan ?? null,
      usage,
      invoices: invoices ?? [],
      recentActivity: auditEvents ?? [],
      plans,
      billingProvider: account?.billing_provider ?? "razorpay",
      gateways: getGatewayStatus(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}