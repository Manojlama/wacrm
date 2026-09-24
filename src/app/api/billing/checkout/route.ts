import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCheckoutUrl } from "@/lib/subscriptions/lifecycle";
import { getAccountProvider, isProviderConfigured } from "@/lib/subscriptions/gateway";

export const runtime = "nodejs";

/**
 * POST /api/billing/checkout
 * Returns the active gateway's hosted-checkout URL (Razorpay short_url
 * / Cashfree subscription_url) for the account's subscription so the
 * owner can complete payment (end a trial, clear a past-due balance,
 * or re-activate). The page redirects the browser to this URL.
 *
 * Fails fast with a clear message when the account's gateway has no
 * API keys in the server environment — otherwise the natural backend
 * fallback (startTrial skips the remote link) reads as a dead-end
 * "no checkout session" with no explanation.
 */
export async function POST() {
  try {
    const ctx = await requireRole("owner");
    const admin = supabaseAdmin();

    const provider = await getAccountProvider(admin, ctx.accountId);
    if (!isProviderConfigured(provider)) {
      const label = provider === "cashfree" ? "Cashfree" : "Razorpay";
      return NextResponse.json(
        {
          error: `Payments aren't enabled yet — the ${label} gateway isn't configured in the server environment. Add its API keys to go live.`,
        },
        { status: 400 },
      );
    }

    const checkoutUrl = await getCheckoutUrl(ctx.accountId);
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "No checkout session available. Contact support." },
        { status: 404 },
      );
    }

    return NextResponse.json({ checkout_url: checkoutUrl });
  } catch (err) {
    return toErrorResponse(err);
  }
}