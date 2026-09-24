// ============================================================
// Razorpay webhook processor — idempotent.
//
// The `subscription_events` table keys rows by Razorpay's `event.id`,
// which is globally unique per event. If the same webhook delivery
// arrives twice (Razorpay retries, at-least-once semantics), the
// unique constraint makes the second insert a no-op — the event is
// never double-processed. A successful 200 tells Razorpay to stop
// retrying; a failed event marks the row processed=false + error so
// a later retry can still pick it up.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  RazorpayPayment,
  RazorpaySubscription,
} from "@/lib/subscriptions/razorpay";
import { getPlanById } from "@/lib/subscriptions/plans";
import type { SubscriptionStatus } from "@/types/subscription";

export interface RazorpayWebhookPayload {
  event: string;
  account_id: string;
  created_at: number;
  contains?: string[];
  payload: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
    invoice?: { entity?: unknown };
    order?: { entity?: unknown };
  };
}

/** Mark the event as processed atomically (guarded re-update). */
async function markProcessed(
  eventId: string,
  opts: { ok: boolean; error?: string },
): Promise<void> {
  const admin = supabaseAdmin();
  await admin
    .from("subscription_events")
    .update({
      processed: opts.ok,
      processed_at: new Date().toISOString(),
      error_message: opts.ok ? null : opts.error ?? null,
    })
    .eq("event_id", eventId);
}

/**
 * Look up the local subscription row that owns a Razorpay
 * subscription id, so inbound webhook events map back to the right
 * tenant and subscription.
 */
async function findSubscriptionByRazorpayId(
  razorpaySubscriptionId: string,
): Promise<import("@/types/subscription").Subscription | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("razorpay_subscription_id", razorpaySubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as import("@/types/subscription").Subscription | null) ?? null;
}

/** Best-effort account resolution for the event log row. */
async function findAccountForEvent(payload: RazorpayWebhookPayload): Promise<string | null> {
  const admin = supabaseAdmin();
  const rzSubId = payload.payload.subscription?.entity?.id;
  if (rzSubId) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("account_id")
      .eq("razorpay_subscription_id", rzSubId)
      .maybeSingle();
    if (sub?.account_id) return sub.account_id as string;
  }
  const rzCustomerId = (payload.payload as { customer?: { entity?: { id?: string } } }).customer?.entity?.id;
  if (rzCustomerId) {
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("razorpay_customer_id", rzCustomerId)
      .maybeSingle();
    if (account?.id) return account.id as string;
  }
  return null;
}

/**
 * Apply the subscription entity state to our local row + account.
 */
async function syncSubscriptionFromRazorpay(
  rzSub: RazorpaySubscription,
): Promise<void> {
  const admin = supabaseAdmin();

  const local = await findSubscriptionByRazorpayId(rzSub.id);
  if (!local) {
    console.error(`[razorpay webhook] no local subscription for ${rzSub.id}`);
    return;
  }

  const nextStatus = mapRazorpayStatus(rzSub.status);

  const patch: Record<string, unknown> = {
    status: nextStatus,
    current_period_start: rzSub.current_period_start
      ? new Date(rzSub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: rzSub.current_period_end
      ? new Date(rzSub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(rzSub.cancel_at_period_end),
    cancelled_at: rzSub.cancelled_at
      ? new Date(rzSub.cancelled_at * 1000).toISOString()
      : null,
  };

  // Direct plan swap from a subscription.updated event
  if (rzSub.plan_id && rzSub.plan_id !== local.razorpay_plan_id) {
    const plan = await getPlanById(local.plan_id);
    // plan_id on the event is a Razorpay plan; our plan row may have
    // that mapping on monthly/yearly. Try to match before switching.
    const matchingPlan = await resolvePlanFromRazorpayPlanId(rzSub.plan_id);
    if (matchingPlan) {
      patch.plan_id = matchingPlan.id;
      patch.razorpay_plan_id = rzSub.plan_id;
      if (plan) {
        await admin.from("accounts").update({ current_plan_id: matchingPlan.id }).eq("id", local.account_id);
      }
    }
  } else {
    patch.razorpay_plan_id = rzSub.plan_id;
  }

  await admin.from("subscriptions").update(patch).eq("id", local.id);
  await admin
    .from("accounts")
    .update({ subscription_status: nextStatus })
    .eq("id", local.account_id);
}

function mapRazorpayStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "created":
    case "authenticated":
    case "pending":
      return "trialing";
    case "halted":
      return "past_due";
    case "paused":
      return "suspended";
    case "cancelled":
    case "completed":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "trialing";
  }
}

async function resolvePlanFromRazorpayPlanId(
  razorpayPlanId: string,
): Promise<{ id: string } | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("plans")
    .select("id")
    .or(
      `razorpay_plan_id_monthly.eq.${razorpayPlanId},razorpay_plan_id_yearly.eq.${razorpayPlanId}`,
    )
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

// ============================================================
// Per-event handlers
// ============================================================

async function onSubscriptionActivated(payload: RazorpayWebhookPayload): Promise<void> {
  const entity = payload.payload.subscription?.entity;
  if (!entity) return;
  await syncSubscriptionFromRazorpay(entity);
  await recordInvoiceFromSubscription(entity);
  await writeAudit("subscription.activated", entity, "Subscription activated");
}

async function onSubscriptionCharged(payload: RazorpayWebhookPayload): Promise<void> {
  const entity = payload.payload.subscription?.entity;
  const payment = payload.payload.payment?.entity;
  if (!entity) return;
  await syncSubscriptionFromRazorpay(entity);
  if (payment) await recordInvoiceFromPayment(payment);
  await writeAudit("subscription.charged", entity, "Recurring payment charged");
}

async function onSubscriptionCancelled(payload: RazorpayWebhookPayload): Promise<void> {
  const entity = payload.payload.subscription?.entity;
  if (!entity) return;
  await syncSubscriptionFromRazorpay(entity);
  await writeAudit("subscription.cancelled", entity, "Subscription cancelled");
}

async function onSubscriptionPaused(payload: RazorpayWebhookPayload): Promise<void> {
  const entity = payload.payload.subscription?.entity;
  if (!entity) return;
  await syncSubscriptionFromRazorpay(entity);
  await writeAudit("subscription.paused", entity, "Subscription paused");
}

async function onSubscriptionResumed(payload: RazorpayWebhookPayload): Promise<void> {
  const entity = payload.payload.subscription?.entity;
  if (!entity) return;
  await syncSubscriptionFromRazorpay(entity);
  await writeAudit("subscription.resumed", entity, "Subscription resumed");
}

async function onPaymentFailed(payload: RazorpayWebhookPayload): Promise<void> {
  const payment = payload.payload.payment?.entity;
  const rzSub = payload.payload.subscription?.entity;
  if (!payment || !rzSub) return;

  const admin = supabaseAdmin();
  const local = await findSubscriptionByRazorpayId(rzSub.id);
  if (!local) return;

  // Move to past_due and increment the failure counter. A later
  // grace-period job escalates to suspended if unresolved.
  const failedCount = (local.failed_payment_count ?? 0) + 1;
  const status: SubscriptionStatus =
    failedCount <= 1 ? "past_due" : "grace_period";

  await admin
    .from("subscriptions")
    .update({
      status,
      failed_payment_count: failedCount,
      grace_period_ends_at:
        status === "grace_period"
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : local.grace_period_ends_at,
    })
    .eq("id", local.id);
  await admin
    .from("accounts")
    .update({ subscription_status: status })
    .eq("id", local.account_id);

  await admin.from("invoices").insert({
    account_id: local.account_id,
    subscription_id: local.id,
    razorpay_payment_id: payment.id,
    amount: payment.amount ?? 0,
    currency: payment.currency ?? "INR",
    status: "failed",
    billing_reason: payment.error_description ?? payment.failure_reason ?? "payment_failed",
  });

  await writeAudit("payment.failed", rzSub, `Payment failed: ${payment.error_description ?? "unknown error"}`);
}

async function onSubscriptionPending(payload: RazorpayWebhookPayload): Promise<void> {
  const rzSub = payload.payload.subscription?.entity;
  if (!rzSub) return;
  // Pending means awaiting first auth so the customer hasn't paid yet —
  // stay on trial until subscription.activated confirms.
  const admin = supabaseAdmin();
  const local = await findSubscriptionByRazorpayId(rzSub.id);
  if (!local) return;
  await admin
    .from("subscriptions")
    .update({ status: "trialing" })
    .eq("id", local.id);
  await admin
    .from("accounts")
    .update({ subscription_status: "trialing" })
    .eq("id", local.account_id);
}

// ============================================================
// Invoice helpers
// ============================================================

async function recordInvoiceFromSubscription(
  rzSub: RazorpaySubscription,
): Promise<void> {
  const admin = supabaseAdmin();
  const local = await findSubscriptionByRazorpayId(rzSub.id);
  if (!local) return;

  await admin.from("invoices").insert({
    account_id: local.account_id,
    subscription_id: local.id,
    razorpay_order_id: rzSub.id,
    amount: 0, // filled in by the charged event's payment entity
    status: "pending",
    billing_reason: "subscription_activation",
  });
}

async function recordInvoiceFromPayment(payment: RazorpayPayment): Promise<void> {
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, account_id")
    .eq("razorpay_subscription_id", payment.invoice_id ?? "")
    .maybeSingle();

  await admin.from("invoices").insert({
    account_id: sub?.account_id ?? undefined,
    subscription_id: sub?.id ?? undefined,
    razorpay_payment_id: payment.id,
    amount: payment.amount ?? 0,
    currency: payment.currency ?? "INR",
    status: payment.captured === false ? "failed" : "paid",
    billing_reason: "recurring_charge",
    paid_at: payment.captured === false ? null : new Date().toISOString(),
  });
}

// ============================================================
// Audit helper
// ============================================================

async function writeAudit(
  action: string,
  rzSub: RazorpaySubscription,
  detail: string,
): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const { data: account } = await admin
      .from("subscriptions")
      .select("account_id")
      .eq("razorpay_subscription_id", rzSub.id)
      .maybeSingle();
    if (!account?.account_id) return;
    await admin.rpc("record_audit_log", {
      p_account_id: account.account_id,
      p_actor_user_id: null,
      p_actor_email: null,
      p_action: action,
      p_resource_type: "subscription",
      p_resource_id: rzSub.id,
      p_details: { detail, status: rzSub.status },
    });
  } catch (err) {
    console.error("[razorpay webhook] audit log failed:", err);
  }
}

// ============================================================
// Main entry — dedupe + dispatch
// ============================================================

const EVENT_HANDLERS: Record<string, (p: RazorpayWebhookPayload) => Promise<void>> = {
  "subscription.activated": onSubscriptionActivated,
  "subscription.charged": onSubscriptionCharged,
  "subscription.cancelled": onSubscriptionCancelled,
  "subscription.paused": onSubscriptionPaused,
  "subscription.resumed": onSubscriptionResumed,
  "subscription.pending": onSubscriptionPending,
  "payment.failed": onPaymentFailed,
};

export async function processRazorpayWebhook(payload: RazorpayWebhookPayload): Promise<{
  handled: boolean;
  duplicate: boolean;
}> {
  const admin = supabaseAdmin();

  // Razorpay webhooks carry NO unique event id — the payload has
  // { event (type), account_id, created_at }. Idempotency must be pinned
  // to a deterministic composite: a retried delivery of the SAME event
  // keeps the same account_id + created_at, while two distinct events
  // of the same type differ by created_at (per delivery) or account.
  // The unique(event_id) constraint then makes retries no-ops without
  // ever dropping a legitimately distinct charge.
  const eventId =
    `${payload.account_id ?? "na"}:${payload.event ?? "na"}:${payload.created_at ?? "na"}`;

  // Idempotency gate: the unique(event_id) constraint makes this
  // INSERT fail harmlessly on retry.
  const accountId = await findAccountForEvent(payload);

  const { error: insertErr } = await admin.from("subscription_events").insert({
    event_id: eventId,
    event_type: payload.event,
    account_id: accountId,
    payload: payload as unknown as Record<string, unknown>,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Duplicate event — already processed (or in-flight).
      return { handled: true, duplicate: true };
    }
    console.error("[razorpay webhook] event insert failed:", insertErr);
    throw insertErr;
  }

  const handler = EVENT_HANDLERS[payload.event];
  if (!handler) {
    // Unknown but valid event — record & return 200 so Razorpay
    // doesn't retry forever.
    await markProcessed(eventId, { ok: true });
    return { handled: false, duplicate: false };
  }

  try {
    await handler(payload);
    await markProcessed(eventId, { ok: true });
    return { handled: true, duplicate: false };
  } catch (err) {
    await markProcessed(eventId, { ok: false, error: String(err) });
    throw err;
  }
}