import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  cancelSubscription,
  reactivateSubscription,
} from "@/lib/subscriptions/lifecycle";

export const runtime = "nodejs";

/**
 * POST /api/billing/manage
 * Customer-initiated subscription actions (owner only).
 *
 * Body:
 *   { action: "cancel" }
 *   { action: "reactivate" }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireRole("owner");
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action;

    if (action === "cancel") {
      await cancelSubscription({
        accountId: ctx.accountId,
        atPeriodEnd: true,
        auditCtx: { actorUserId: ctx.userId, actorEmail: ctx.userEmail },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "reactivate") {
      await reactivateSubscription({
        accountId: ctx.accountId,
        auditCtx: { actorUserId: ctx.userId, actorEmail: ctx.userEmail },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return toErrorResponse(err);
  }
}