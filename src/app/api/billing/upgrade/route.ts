import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { changePlan } from "@/lib/subscriptions/lifecycle";

export const runtime = "nodejs";

/**
 * POST /api/billing/upgrade
 * Change the customer's plan. Owner only. Body:
 *   { plan_id: string, billing_cycle?: "monthly" | "yearly" }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireRole("owner");
    const body = (await req.json().catch(() => ({}))) as {
      plan_id?: string;
      billing_cycle?: "monthly" | "yearly";
    };

    if (!body.plan_id || typeof body.plan_id !== "string") {
      return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
    }
    if (
      body.billing_cycle &&
      body.billing_cycle !== "monthly" &&
      body.billing_cycle !== "yearly"
    ) {
      return NextResponse.json({ error: "billing_cycle must be monthly|yearly" }, { status: 400 });
    }

    await changePlan({
      accountId: ctx.accountId,
      newPlanId: body.plan_id,
      billingCycle: body.billing_cycle,
      auditCtx: { actorUserId: ctx.userId, actorEmail: ctx.userEmail },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}