// ============================================================
// Cashfree API client — server-side ONLY.
//
// Uses Cashfree's Payments Gateway (PG) Subscriptions API
// (x-api-version 2023-08-01), the current maintained integration:
//   1. Create a PERIODIC plan  → POST /pg/plans
//   2. Create a subscription    → POST /pg/subscriptions (returns
//      a hosted `subscription_url` auth link, the Cashfree
//      analogue of Razorpay's checkout short_url)
//   3. Webhooks confirm the first charge / renewals.
//
// Auth is NOT Basic/Bearer — the PG API authenticates with the
// `x-client-id` / `x-client-secret` headers (provided by the
// Cashfree dashboard + accepted by the sandbox).
//
// IMPORTANT (amounts): Cashfree PG amounts are rupee (whole)
// units while the app stores paise (migration 040). All outbound
// amounts pass through `cashfreeAmountFromPaise`; the conversion
// is intentionally a single chokepoint so an API-contract change
// (sub-unit vs unit amounts) is a one-line fix. VERIFY against a
// real sandbox before going live.
//
// Secret keys live in env vars and are NEVER exposed to the
// browser.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

const X_API_VERSION = "2023-08-01";

export function cashfreeEnv(): "sandbox" | "production" {
  return process.env.CASHEFREE_ENV === "production" ? "production" : "sandbox";
}

function cashfreeBase(): string {
  return cashfreeEnv() === "production"
    ? "https://api.cashfree.com"
    : "https://sandbox.cashfree.com";
}

function cashfreeCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.CASHEFREE_CLIENT_ID;
  const clientSecret = process.env.CASHEFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "CASHEFREE_CLIENT_ID / CASHEFREE_CLIENT_SECRET are not configured",
    );
  }
  return { clientId, clientSecret };
}

export class CashfreeError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly message_detail?: string;
  constructor(message: string, status: number, code?: string, messageDetail?: string) {
    super(message);
    this.name = "CashfreeError";
    this.status = status;
    this.code = code;
    this.message_detail = messageDetail;
  }
}

async function cashfreeRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { clientId, clientSecret } = cashfreeCredentials();

  const res = await fetch(`${cashfreeBase()}${path}`, {
    method,
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": X_API_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } })?.error;
    throw new CashfreeError(
      e?.message ?? `Cashfree ${method} ${path} failed (${res.status})`,
      res.status,
      e?.code,
      e?.message,
    );
  }
  return json as T;
}

// ============================================================
// Unit conversion — paise (app) ↔ rupees (Cashfree PG API)
// ============================================================

/** Cashfree PG amounts are rupee units; the app stores paise. */
export function cashfreeAmountFromPaise(paise: number): number {
  return Math.round(paise / 100);
}

/** Inverse of `cashfreeAmountFromPaise` (webhook amounts). */
export function cashfreeAmountToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

// ============================================================
// Entity shapes (subset used by the app)
// ============================================================

export type CashfreePlanInterval = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface CashfreePlan {
  plan_id: string;
  plan_name?: string;
  plan_type?: "PERIODIC" | "ON_DEMAND";
  plan_currency?: string;
  plan_recurring_amount?: number;
  plan_max_amount?: number;
  plan_max_cycles?: number;
  plan_interval_type?: CashfreePlanInterval;
  plan_intervals?: number;
  plan_status?: "ACTIVE" | "DELETED" | "DISABLED" | "IN_USE";
}

export type CashfreeSubscriptionStatus =
  | "INITIALIZED"
  | "ACTIVE"
  | "ON_HOLD"
  | "PAUSED"
  | "CANCELLED"
  | "COMPLETED"
  | "EXPIRED";

export interface CashfreeSubscription {
  subscription_id: string;
  plan_id?: string;
  customer_id?: string;
  subscription_status?: CashfreeSubscriptionStatus;
  subscription_url?: string | null;
  subscription_currency?: string;
  subscription_amount?: number;
  auth_amount?: number;
  subscription_first_charge_date?: string;
  subscription_created_at?: string;
  subscription_expiry_time?: string;
  payment_splits?: unknown[];
  order_meta?: unknown;
}

export interface CashfreePayment {
  payment_id?: string;
  payment_amount?: number;
  payment_currency?: string;
  payment_status?: string;
  auth_id?: string;
  auth_amount?: number;
  payment_time?: string;
  failure_reason?: string;
}

// ============================================================
// Plan API
// ============================================================

/**
 * Create a PERIODIC subscription plan on Cashfree. `amountPaise` is
 * in paise; Cashfree receives whole rupees via the client helper.
 */
export async function createCashfreePlan(params: {
  planId: string;
  name: string;
  amountPaise: number;
  cycle: "monthly" | "yearly";
  currency?: string;
  maxCycles?: number;
}): Promise<CashfreePlan> {
  const intervalType: CashfreePlanInterval = params.cycle === "yearly" ? "YEAR" : "MONTH";
  return cashfreeRequest<CashfreePlan>("POST", "/pg/plans", {
    plan_id: params.planId,
    plan_name: params.name,
    plan_type: "PERIODIC",
    plan_currency: params.currency ?? "INR",
    plan_recurring_amount: cashfreeAmountFromPaise(params.amountPaise),
    plan_max_amount: cashfreeAmountFromPaise(params.amountPaise),
    plan_max_cycles: params.maxCycles ?? 36,
    plan_intervals: 1,
    plan_interval_type: intervalType,
  });
}

// ============================================================
// Subscription API
// ============================================================

export async function createCashfreeSubscription(params: {
  subscriptionId: string;
  planId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  returnUrl?: string;
  amountPaise?: number;
  authAmountPaise?: number;
  firstChargeDate?: string;
  expiryType?: "PERIODIC" | "ON_DEMAND";
  maxAmountPaise?: number;
}): Promise<CashfreeSubscription> {
  return cashfreeRequest<CashfreeSubscription>("POST", "/pg/subscriptions", {
    subscription_id: params.subscriptionId,
    plan_id: params.planId,
    customer_details: {
      customer_id: params.customerId,
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone ?? "",
    },
    subscription_expiry_type: params.expiryType ?? "PERIODIC",
    subscription_note: "WACRM subscription",
    ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
    ...(params.firstChargeDate ? { subscription_first_charge_date: params.firstChargeDate } : {}),
    ...(params.authAmountPaise !== undefined
      ? { auth_amount: cashfreeAmountFromPaise(params.authAmountPaise) }
      : {}),
    ...(params.amountPaise !== undefined
      ? { subscription_amount: cashfreeAmountFromPaise(params.amountPaise) }
      : {}),
    ...(params.maxAmountPaise !== undefined
      ? { subscription_max_amount: cashfreeAmountFromPaise(params.maxAmountPaise) }
      : {}),
  });
}

export async function fetchCashfreeSubscription(
  subscriptionId: string,
): Promise<CashfreeSubscription> {
  return cashfreeRequest<CashfreeSubscription>(
    "GET",
    `/pg/subscriptions/${subscriptionId}`,
  );
}

export async function cancelCashfreeSubscription(
  subscriptionId: string,
  cancelReason?: string,
): Promise<CashfreeSubscription> {
  return cashfreeRequest<CashfreeSubscription>(
    "POST",
    `/pg/subscriptions/${subscriptionId}/cancel`,
    { cancel_reason: cancelReason ?? "Cancel requested by customer" },
  );
}

export async function pauseCashfreeSubscription(
  subscriptionId: string,
  pauseReason?: string,
): Promise<CashfreeSubscription> {
  return cashfreeRequest<CashfreeSubscription>(
    "POST",
    `/pg/subscriptions/${subscriptionId}/pause`,
    { pause_reason: pauseReason ?? "Requested by customer" },
  );
}

export async function resumeCashfreeSubscription(
  subscriptionId: string,
): Promise<CashfreeSubscription> {
  return cashfreeRequest<CashfreeSubscription>(
    "POST",
    `/pg/subscriptions/${subscriptionId}/resume`,
    {},
  );
}

// ============================================================
// Webhook signature verification
//
// Cashfree signs webhooks with two headers:
//   x-webhook-signature = base64(HMAC-SHA256(timestamp + rawBody,
//                                               clientSecret))
//   x-webhook-timestamp = Unix seconds at signing time
// The raw body MUST be the exact bytes received (no re-serialise).
// ============================================================

export function verifyCashfreeWebhookSignature(params: {
  timestamp: string | null;
  rawBody: string;
  signature: string | null;
  secret?: string;
}): boolean {
  const { timestamp, rawBody, signature } = params;
  const secret = params.secret ?? process.env.CASHEFREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[cashfree] CASHEFREE_WEBHOOK_SECRET is not configured");
    return false;
  }
  if (!timestamp || !signature) return false;

  const digest = createHmac("sha256", secret)
    .update(`${timestamp}${rawBody}`)
    .digest("base64");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ============================================================
// Status mapping — Cashfree status → local SubscriptionStatus
// ============================================================

export function mapCashfreeSubscriptionStatus(
  status: string | undefined,
): import("@/types/subscription").SubscriptionStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "INITIALIZED":
    case "AUTH_INITIATED":
      // Awaiting first auth — the customer hasn't paid yet.
      return "trialing";
    case "ON_HOLD":
    case "AUTH_FAILED":
      return "past_due";
    case "PAUSED":
      return "suspended";
    case "CANCELLED":
    case "COMPLETED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "trialing";
  }
}

export function isCashfreeConfigured(): boolean {
  return Boolean(
    process.env.CASHEFREE_CLIENT_ID && process.env.CASHEFREE_CLIENT_SECRET,
  );
}