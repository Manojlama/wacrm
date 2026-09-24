// ============================================================
// Razorpay API client — server-side ONLY.
//
// Secret keys live in env vars and are NEVER exposed to the
// browser. All calls go through the Razorpay REST API directly
// with HTTP Basic auth (key:secret), so we don't add the
// `razorpay` npm dependency.
//
// Currency amounts are integers in paise (₹0.01).
// ============================================================

import { createHmac } from "node:crypto";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function razorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured");
  }
  return { keyId, keySecret };
}

export class RazorpayError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly description?: string;
  constructor(message: string, status: number, code?: string, description?: string) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

async function razorpayRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { keyId, keySecret } = razorpayCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`${RAZORPAY_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // Razorpay can be slow on retries; 30s is generous.
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
    const e = (json as { error?: { code?: string; description?: string } })?.error;
    throw new RazorpayError(
      e?.description ?? `Razorpay ${method} ${path} failed (${res.status})`,
      res.status,
      e?.code,
      e?.description,
    );
  }
  return json as T;
}

// ============================================================
// Entity shapes (subset used by the app)
// ============================================================

export interface RazorpayPlan {
  id: string;
  period: string;
  interval: number;
  item: {
    name: string;
    amount: number;
    currency: string;
    description?: string;
  };
  notes?: Record<string, unknown>;
}

export interface RazorpayCustomer {
  id: string;
  name?: string;
  email?: string;
  contact?: string;
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired"
    | "paused";
  current_period_start?: number;
  current_period_end?: number;
  ended_at?: number | null;
  cancel_at_period_end?: boolean;
  cancelled_at?: number | null;
  total_count: number;
  paid_count: number;
  customer_notify: boolean;
  notes?: Record<string, unknown>;
  short_url?: string | null;
  auth_attempts?: number;
  expire_by?: number | null;
  start_at?: number;
  remaining_count?: number;
}

export interface RazorpayPayment {
  id: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  method?: string;
  description?: string;
  invoice_id?: string;
  failure_reason?: string;
  error_code?: string;
  error_description?: string;
  captured?: boolean;
}

// ============================================================
// Customer API
// ============================================================

export async function createRazorpayCustomer(params: {
  name: string;
  email?: string;
  contact?: string;
}): Promise<RazorpayCustomer> {
  return razorpayRequest<{ id: string; name?: string; email?: string; contact?: string }>(
    "POST",
    "/customers",
    {
      name: params.name,
      ...(params.email ? { email: params.email } : {}),
      ...(params.contact ? { contact: params.contact } : {}),
    },
  );
}

// ============================================================
// Plan API
// ============================================================

/**
 * Create a recurring plan on Razorpay. `amount` is in paise.
 * `period` ∈ {daily, weekly, monthly, yearly} with `interval`.
 */
export async function createRazorpayPlan(params: {
  name: string;
  amount: number;
  period: "monthly" | "yearly";
  interval?: number;
  currency?: string;
  description?: string;
}): Promise<RazorpayPlan> {
  return razorpayRequest<RazorpayPlan>("POST", "/plans", {
    period: params.period,
    interval: params.interval ?? 1,
    item: {
      name: params.name,
      amount: params.amount,
      currency: params.currency ?? "INR",
      ...(params.description ? { description: params.description } : {}),
    },
  });
}

// ============================================================
// Subscription API
// ============================================================

export async function createRazorpaySubscription(params: {
  plan_id: string;
  customer_id?: string;
  total_count?: number;
  customer_notify?: number;
  quantity?: number;
  start_at?: number;
  expire_by?: number;
  notes?: Record<string, unknown>;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: params.plan_id,
    ...(params.customer_id ? { customer_id: params.customer_id } : {}),
    total_count: params.total_count ?? 36,
    customer_notify: params.customer_notify ?? 1,
    quantity: params.quantity ?? 1,
    ...(params.start_at ? { start_at: params.start_at } : {}),
    ...(params.expire_by ? { expire_by: params.expire_by } : {}),
    ...(params.notes ? { notes: params.notes } : {}),
  });
}

export async function fetchRazorpaySubscription(
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "GET",
    `/subscriptions/${subscriptionId}`,
  );
}

export async function cancelRazorpaySubscription(
  subscriptionId: string,
  cancelAtEnd?: boolean,
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${subscriptionId}/cancel`,
    cancelAtEnd === undefined ? {} : { cancel_at_cycle_end: cancelAtEnd },
  );
}

export async function pauseRazorpaySubscription(
  subscriptionId: string,
  pauseAt?: "now" | "cycle_end",
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${subscriptionId}/pause`,
    { pause_at: pauseAt ?? "now" },
  );
}

export async function resumeRazorpaySubscription(
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${subscriptionId}/resume`,
  );
}

/**
 * Update a subscription (used for plan changes). `plan_id` swaps to
 * the new plan at the next billing cycle unless `schedule_change_at`
 * is passed.
 */
export async function updateRazorpaySubscription(
  subscriptionId: string,
  params: { plan_id?: string; quantity?: number; schedule_change_at?: "now" | "cycle_end" },
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "PATCH",
    `/subscriptions/${subscriptionId}`,
    {
      ...(params.plan_id ? { plan_id: params.plan_id } : {}),
      ...(params.quantity ? { quantity: params.quantity } : {}),
      ...(params.schedule_change_at
        ? { schedule_change_at: params.schedule_change_at }
        : {}),
    },
  );
}

// ============================================================
// Webhook signature verification
// ============================================================

/**
 * Verify the Razorpay webhook signature. `body` MUST be the raw
 * request body string (not re-serialised) for the HMAC to match.
 */
export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string | null,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay] RAZORPAY_WEBHOOK_SECRET is not configured");
    return false;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

// ============================================================
// Checkout session helpers
//
// We use Razorpay's checkout for the first payment on a
// subscription. The flow:
//   1. Server creates the subscription (returns short_url).
//   2. Client redirects the user to short_url to authorise the
//      first charge.
//   3. subscription.activated / subscription.charged webhooks
//      confirm activation server-side.
// ============================================================

export function isConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}