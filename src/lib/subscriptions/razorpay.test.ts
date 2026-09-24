import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRazorpayWebhookSignature } from "./razorpay";

describe("verifyRazorpayWebhookSignature", () => {
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_123";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
    vi.restoreAllMocks();
  });

  it("accepts a valid signature", () => {
    // Use the same HMAC construction the handler would use.
    const body = JSON.stringify({ event: "subscription.activated" });
    const signature = createHmac("sha256", "webhook_secret_123")
      .update(body)
      .digest("hex");

    expect(verifyRazorpayWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const original = JSON.stringify({ event: "subscription.activated", amount: 100 });
    const tampered = JSON.stringify({ event: "subscription.activated", amount: 999999 });
    const signature = createHmac("sha256", "webhook_secret_123")
      .update(original)
      .digest("hex");

    expect(verifyRazorpayWebhookSignature(tampered, signature)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyRazorpayWebhookSignature("{}", null)).toBe(false);
    expect(verifyRazorpayWebhookSignature("{}", "")).toBe(false);
  });

  it("rejects when the webhook secret is not configured", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = "{}";
    const signature = createHmac("sha256", "unrelated").update(body).digest("hex");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(verifyRazorpayWebhookSignature(body, signature)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("rejects a signature from the wrong secret", () => {
    const body = "{}";
    const signature = createHmac("sha256", "different_secret").update(body).digest("hex");
    expect(verifyRazorpayWebhookSignature(body, signature)).toBe(false);
  });
});