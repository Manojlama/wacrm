import { NextResponse, type NextRequest } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/subscriptions/razorpay";
import { processRazorpayWebhook } from "@/lib/subscriptions/webhook-handler";
import type { RazorpayWebhookPayload } from "@/lib/subscriptions/webhook-handler";
import { verifyCashfreeWebhookSignature } from "@/lib/subscriptions/cashfree";
import { processCashfreeWebhook, type CashfreeWebhookPayload } from "@/lib/subscriptions/cashfree-webhook-handler";

export const runtime = "nodejs";

// The handler must receive the RAW body so the HMAC signature check
// operates on the exact bytes the gateway signed. Next.js gives us the
// body as text via request.text(); we do NOT re-serialise JSON.
//
// Gateways share the endpoint:
//   * /api/billing/webhook             → Razorpay (x-razorpay-signature)
//   * /api/billing/webhook?gateway=cashfree
//                                     → Cashfree (x-webhook-signature +
//                                       x-webhook-timestamp)
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const url = new URL(request.url);
  const gateway = url.searchParams.get("gateway");

  if (gateway === "cashfree") {
    return handleCashfree(rawBody, request);
  }
  return handleRazorpay(rawBody, request);
}

async function handleRazorpay(rawBody: string, request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");

  // 1. Verify the signature. Reject immediately on failure — never
  //    process an unverified webhook.
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 2. Parse + validate minimal shape.
  let payload: Partial<RazorpayWebhookPayload>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.event || !payload.payload) {
    // A validly signed but structurally unexpected event — 200 so
    // Razorpay stops retrying; we log it for the operator.
    console.warn("[razorpay webhook] signed but unexpected payload shape", {
      event: payload.event,
      account_id: payload.account_id,
    });
    return NextResponse.json({ ok: true });
  }

  // 3. Idempotent processing. Throwing here (via the handler's error
  //    paths) makes Next return 500 → Razorpay retries → our unique
  //    constraint treats the retry as a duplicate (no double-billing).
  try {
    const result = await processRazorpayWebhook(payload as RazorpayWebhookPayload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[razorpay webhook] processing failed:", err);
    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }
}

async function handleCashfree(rawBody: string, request: NextRequest) {
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");

  // 1. Verify the signature: base64(HMAC-SHA256(timestamp + rawBody)).
  if (!verifyCashfreeWebhookSignature({ timestamp, rawBody, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 2. Parse.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await processCashfreeWebhook(payload as CashfreeWebhookPayload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cashfree webhook] processing failed:", err);
    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }
}

// Gateways may verify the endpoint with a GET — respond ok.
export async function GET() {
  return NextResponse.json({ ok: true });
}