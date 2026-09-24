// ============================================================
// Subscription state machine
//
// Clear lifecycle for a customer subscription:
//
//   trialing ──(trial ends, has card / paid)──▶ active
//   trialing ──(trial ends, no payment)───────▶ expired
//   active   ──(payment failed)───────────────▶ past_due
//   past_due ──(grace period started)─────────▶ grace_period
//   grace_period ──(paid)─────────────────────▶ active
//   grace_period ──(grace expires)────────────▶ suspended
//   active ──(owner cancels)──────────────────▶ cancelled  (at period end)
//   cancelled ──(reactivate)──────────────────▶ active
//   any ──(hard stop)─────────────────────────▶ cancelled  (immediate)
//   suspended ──(admin reactivates)───────────▶ active
//
// Rule: never DELETE customer data on expiry/suspension/cancel.
// ============================================================

import type { SubscriptionStatus } from "@/types/subscription";

/** Ordered lifecycle rank — used to pick the most severe state. */
export const SUBSCRIPTION_STATUS_RANK: Record<SubscriptionStatus, number> = {
  trialing: 1,
  active: 2,
  past_due: 3,
  grace_period: 4,
  suspended: 5,
  cancelled: 6,
  expired: 7,
};

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "suspended",
  "cancelled",
  "expired",
];

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * True when the subscription is in a state that allows full product
 * usage. `trialing` and `active` can use everything; `grace_period`
 * allows read/limited use; past_due/suspended/cancelled/expired
 * block writes.
 */
export function canUseProduct(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active";
}

/** Grace-period accounts can read but their outbound actions are held. */
export function canReadProduct(status: SubscriptionStatus): boolean {
  return (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "grace_period"
  );
}

/** Allows the customer-facing billing page to reactivate. */
export function canReactivate(status: SubscriptionStatus): boolean {
  return (
    status === "cancelled" ||
    status === "past_due" ||
    status === "grace_period" ||
    status === "suspended" ||
    status === "expired"
  );
}

/** States that keep the subscription in the state machine at all. */
export function isTerminal(status: SubscriptionStatus): boolean {
  return status === "cancelled";
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  grace_period: "Grace period",
  suspended: "Suspended",
  cancelled: "Cancelled",
  expired: "Expired",
};