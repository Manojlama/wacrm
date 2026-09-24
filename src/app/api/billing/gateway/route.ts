import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getGatewayStatus,
  isBillingProvider,
  isProviderConfigured,
} from "@/lib/subscriptions/gateway";

export const runtime = "nodejs";

/**
 * POST /api/billing/gateway
 * Owner-only: switch the account's billing provider between
 * razorpay and cashfree.
 *
 * Body: { provider: "razorpay" | "cashfree" }
 *
 * The target provider must be configured (env keys present) — we
 * never let an account point at a gateway we can't bill through.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireRole("owner");
    const body = (await req.json().catch(() => ({}))) as { provider?: unknown };

    if (!isBillingProvider(body.provider)) {
      return NextResponse.json(
        { error: "provider must be razorpay|cashfree" },
        { status: 400 },
      );
    }
    if (!isProviderConfigured(body.provider)) {
      return NextResponse.json(
        { error: "That gateway isn’t configured yet. Contact support to enable it." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: account, error: acctErr } = await admin
      .from("accounts")
      .select("billing_provider")
      .eq("id", ctx.accountId)
      .maybeSingle();

    if (acctErr) {
      console.error("[gateway] account fetch failed:", acctErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const current = isBillingProvider(account?.billing_provider)
      ? account.billing_provider
      : "razorpay";
    if (current === body.provider) {
      return NextResponse.json({ ok: true, provider: body.provider });
    }

    const { error: updateErr } = await admin
      .from("accounts")
      .update({ billing_provider: body.provider })
      .eq("id", ctx.accountId);
    if (updateErr) {
      console.error("[gateway] provider update failed:", updateErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    await admin.rpc("record_audit_log", {
      p_account_id: ctx.accountId,
      p_actor_user_id: ctx.userId,
      p_actor_email: ctx.userEmail,
      p_action: "billing_gateway_changed",
      p_resource_type: "account",
      p_resource_id: ctx.accountId,
      p_details: { from: current, to: body.provider },
    });

    return NextResponse.json({ ok: true, provider: body.provider });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/billing/gateway — which gateways are available + active. */
export async function GET() {
  try {
    await requireRole("viewer");
    const status = getGatewayStatus();
    return NextResponse.json({ gateways: status });
  } catch (err) {
    return toErrorResponse(err);
  }
}