import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlans } from "@/lib/subscriptions/plans";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * GET /api/onboarding
 * Returns the account's onboarding state + the plan catalog so the
 * wizard can render without extra round-trips.
 */
export async function GET() {
  try {
    const ctx = await requireRole("owner");
    const admin = supabaseAdmin();

    const { data: account, error } = await admin
      .from("accounts")
      .select("id, name, onboarding_completed, current_plan_id, subscription_status, trial_ends_at")
      .eq("id", ctx.accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to load onboarding state" }, { status: 500 });
    }

    const plans = await getPlans();

    // The accounts.subscription_status column can lag behind reality
    // (e.g. a trial the wizard created directly). The subscriptions
    // row is the source of truth for whether a plan is actually
    // selected.
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      account: {
        name: account?.name ?? "",
        onboarding_completed: account?.onboarding_completed ?? false,
        subscription_status: account?.subscription_status ?? "trialing",
        current_plan_id: account?.current_plan_id ?? null,
        trial_ends_at: account?.trial_ends_at ?? null,
        has_subscription: Boolean(existingSub),
      },
      plans,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/onboarding
 * Update onboarding state:
 *   { name }                     — rename the business (Step 1)
 *   { onboarding_completed }     — finalise onboarding (Step 7)
 */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("owner");
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      onboarding_completed?: boolean;
    };

    const admin = supabaseAdmin();
    const patch: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim().length > 0) {
      patch.name = body.name.trim().slice(0, 100);
    }

    if (typeof body.onboarding_completed === "boolean") {
      patch.onboarding_completed = body.onboarding_completed;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await admin.from("accounts").update(patch).eq("id", ctx.accountId);
    if (error) {
      return NextResponse.json({ error: "Failed to update onboarding" }, { status: 500 });
    }

    if (patch.onboarding_completed === true) {
      await recordAuditLog({
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        actorEmail: ctx.userEmail ?? null,
        action: "onboarding_completed",
        resourceType: "account",
        resourceId: ctx.accountId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}