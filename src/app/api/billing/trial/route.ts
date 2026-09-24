import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { startTrial } from "@/lib/subscriptions/lifecycle";
import { getLatestSubscription } from "@/lib/subscriptions/plans";

export const runtime = "nodejs";

/**
 * POST /api/billing/trial
 *
 * Start the account's free trial. Called once during onboarding
 * (Step: Choose plan). Idempotent-ish: if the account already has a
 * trial/active subscription this returns the existing state rather
 * than creating a duplicate.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireRole("owner");

    const existing = await getLatestSubscription(ctx.accountId);
    if (existing && existing.status === "trialing") {
      return NextResponse.json(
        { ok: true, already_trialing: true, subscription_id: existing.id },
        { status: 200 },
      );
    }
    if (existing && ["active", "past_due", "grace_period"].includes(existing.status)) {
      return NextResponse.json(
        { ok: true, already_subscribed: true, subscription_id: existing.id },
        { status: 200 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      plan?: string;
      days?: number;
    };

    const result = await startTrial({
      accountId: ctx.accountId,
      planName: body.plan ?? "starter",
      days: body.days,
      contactEmail: ctx.userEmail ?? "",
      contactName: ctx.account.name ?? "",
      auditCtx: {
        actorUserId: ctx.userId,
        actorEmail: ctx.userEmail ?? null,
      },
    });

    // Fire welcome + trial emails best-effort (never block the request).
    const { sendTrialStartedEmail, sendWelcomeEmail } = await import(
      "@/lib/email/templates"
    );
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const trialEnd = new Date(Date.now() + (body.days ?? 14) * 86400000);
    if (ctx.userEmail) {
      sendTrialStartedEmail({
        to: ctx.userEmail,
        days: body.days ?? 14,
        endDate: trialEnd.toLocaleDateString("en-IN"),
        dashboardUrl: `${siteUrl}/dashboard`,
      }).catch(() => {});
      sendWelcomeEmail({
        to: ctx.userEmail,
        name: ctx.account.name ?? "",
      }).catch(() => {});
    }

    return NextResponse.json(
      { ok: true, subscription_id: result.subscriptionId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}