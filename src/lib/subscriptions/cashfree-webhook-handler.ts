// ============================================================
// Cashfree webhook processor — idempotent.
//
// Same contract as the Razorpay processor (webhook-handler.ts):
// every inbound delivery is pinned to a deterministic event_id in
// `subscription_events`; a retry of the same event hits the unique
// constraint and is a no-op, while a genuinely distinct event still
// processes. A 200 tells Cashfree to stop retrying.
//
// Cashfree event names drift between API versions, so the handler
// is intentionally defensive: it resolves the subscription_id, re-
// syncs from the live subscription entity (`fetchCashfreeSubscri-
// ption`), and treats *any* known/discovered event type as a sync
// trigger. Payment-specific events additionally write invoices.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  fetchCashfreeSubscription,
  type CashfreePayment,
  type CashfreeSubscription,
} from "@/lib/subscriptions/cashfree";
import { mapCashfreeSubscriptionStatus } from "@/lib/subscriptions/cashfree";
import type { SubscriptionStatus } from "@/types/subscription";

export interface CashfreeWebhookPayload {
  event_id?: string;
  event_type?: string;
  event_time?: string;
  subscription_id?: string;
  subscription_status?: string;
  payment?: Partial<CashfreePayment> & { id?: string };
  data?: Record<string, unknown>;
}

/** Read a field from either the top level or the nested `data` object. */
function pick(payload: CashfreeWebhookPayload, key: string): unknown {
  if (key in payload && payload[key as keyof CashfreeWebhookPayload] !== undefined) {
    return payload[key as keyof CashfreeWebhookPayload];
  }
  return payload.data?.[key];
}

// ============================================================
// Dispatch helpers
// ============================================================

async function findSubscriptionByCashfreeId(
  cashfreeSubscriptionId: string,
): Promise<import("@/types/subscription").Subscription | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("cashfree_subscription_id", cashfreeSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as import("@/types/subscription").Subscription | null) ?? null;
}

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

async function writeAudit(
  sub: import("@/types/subscription").Subscription,
  action: string,
  detail: string,
): Promise<void> {
  try {
    const admin = supabaseAdmin();
    await admin.rpc("record_audit_log", {
      p_account_id: sub.account_id,
      p_actor_user_id: null,
      p_actor_email: null,
      p_action: action,
      p_resource_type: "subscription",
      p_resource_id: sub.id,
      p_details: { detail, provider: "cashfree" },
    });
  } catch (err) {
    console.error("[cashfree webhook] audit log failed:", err);
  }
}

/**
 * Mirror the remote subscription state onto the local row + account.
 * `remote` may be `null` when the webhook couldn't be re-fetched but
 * we still have the status embedded in the event payload.
 */
async function syncSubscriptionFromRemote(
  local: import("@/types/subscription").Subscription,
  remote: CashfreeSubscription | null,
  embeddedStatus?: string,
): Promise<void> {
  const admin = supabaseAdmin();

  const status = remote
    ? mapCashfreeSubscriptionStatus(remote.subscription_status)
    : mapCashfreeSubscriptionStatus(embeddedStatus);

  const patch: Record<string, unknown> = {
    status,
    current_period_end: remote?.subscription_expiry_time
      ? new Date(remote.subscription_expiry_time).toISOString()
      : local.current_period_end,
  };

  if (remote?.subscription_id && remote.subscription_id !== local.cashfree_subscription_id) {
    patch.cashfree_subscription_id = remote.subscription_id;
  }
  if (remote?.plan_id && remote.plan_id !== local.cashfree_plan_id) {
    patch.cashfree_plan_id = remote.plan_id;
  }

  await admin.from("subscriptions").update(patch).eq("id", local.id);
  await admin
    .from("accounts")
    .update({ subscription_status: status })
    .eq("id", local.account_id);
}

async function onPaymentSuccess(
  local: import("@/types/subscription").Subscription,
  payment: Partial<CashfreePayment> & { id?: string },
): Promise<void> {
  const admin = supabaseAdmin();
  const amountPaise = payment.payment_amount ?? payment.auth_amount;

  await admin.from("invoices").insert({
    account_id: local.account_id,
    subscription_id: local.id,
    gateway: "cashfree",
    cashfree_payment_id: payment.payment_id ?? payment.id ?? null,
    amount: typeof amountPaise === "number" ? Math.round(amountPaise * 100) : 0,
    currency: payment.payment_currency ?? "INR",
    status: "paid",
    billing_reason: "recurring_charge",
    paid_at: payment.payment_time ?? new Date().toISOString(),
  });

  await writeAudit(local, "subscription.charged", "Recurring payment charged");
}

async function onPaymentFailure(
  local: import("@/types/subscription").Subscription,
  payment: Partial<CashfreePayment> & { id?: string },
): Promise<void> {
  const admin = supabaseAdmin();

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
    gateway: "cashfree",
    cashfree_payment_id: payment.payment_id ?? payment.id ?? null,
    amount: typeof payment.payment_amount === "number"
      ? Math.round(payment.payment_amount * 100)
      : 0,
    currency: payment.payment_currency ?? "INR",
    status: "failed",
    billing_reason: payment.failure_reason ?? "payment_failed",
  });

  await writeAudit(
    local,
    "payment.failed",
    `Payment failed: ${payment.failure_reason ?? "unknown error"}`,
  );
}

// ============================================================
// Main entry — dedupe + dispatch
// ============================================================

export async function processCashfreeWebhook(
  payload: CashfreeWebhookPayload,
): Promise<{ handled: boolean; duplicate: boolean }> {
  const admin = supabaseAdmin();

  const eventType =
    (pick(payload, "event_type") as string | undefined) ?? "unknown";
  const subscriptionId =
    (pick(payload, "subscription_id") as string | undefined) ?? null;
  const eventTime =
    (pick(payload, "event_time") as string | undefined) ??
    (pick(payload, "created_at") as string | undefined);

  // Deterministic idempotency key. Prefer Cashfree's event_id when
  // present; otherwise the composite pin (a retried delivery keeps the
  // same subscription_id + event time, distinct events differ).
  const deployedId =
    (payload.event_id as string | undefined) ??
    `${eventType}:${subscriptionId ?? "na"}:${eventTime ?? "na"}`;

  const local = subscriptionId
    ? await findSubscriptionByCashfreeId(subscriptionId)
    : null;

  const { error: insertErr } = await admin.from("subscription_events").insert({
    event_id: deployedId,
    event_type: eventType,
    account_id: local?.account_id ?? null,
    subscription_id: local?.id ?? null,
    payload: payload as unknown as Record<string, unknown>,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Duplicate event — already processed (or in-flight).
      return { handled: true, duplicate: true };
    }
    console.error("[cashfree webhook] event insert failed:", insertErr);
    throw insertErr;
  }

  try {
    // Always re-sync from live state so status reflects Cashfree.
    if (local && subscriptionId) {
      let remote: CashfreeSubscription | null = null;
      try {
        remote = await fetchCashfreeSubscription(subscriptionId);
      } catch (err) {
        console.error(
          `[cashfree webhook] live fetch failed for ${subscriptionId}:`,
          err,
        );
      }
      await syncSubscriptionFromRemote(local, remote, payload.subscription_status);
    }

    // Payment events also write invoices.
    if (/PAYMENT.*SUCCESS|CHARGE.*SUCCESS/i.test(eventType)) {
      if (local) {
        await onPaymentSuccess(local, (pick(payload, "payment") as Partial<CashfreePayment> & { id?: string }) ?? {});
      }
    } else if (/PAYMENT.*(FAILED|DECLINED|CANCELLED)|CHARGE.*FAILED/i.test(eventType)) {
      if (local) {
        await onPaymentFailure(local, (pick(payload, "payment") as Partial<CashfreePayment> & { id?: string }) ?? {});
      }
    }

    await markProcessed(deployedId, { ok: true });
    return { handled: true, duplicate: false };
  } catch (err) {
    await markProcessed(deployedId, { ok: false, error: String(err) });
    throw err;
  }
}