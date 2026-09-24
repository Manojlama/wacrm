import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cashfreeAmountFromPaise,
  cashfreeAmountToPaise,
  mapCashfreeSubscriptionStatus,
  verifyCashfreeWebhookSignature,
} from "./cashfree";

describe("verifyCashfreeWebhookSignature", () => {
  const originalSecret = process.env.CASHEFREE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.CASHEFREE_WEBHOOK_SECRET = "webhook_secret_123";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CASHEFREE_WEBHOOK_SECRET;
    } else {
      process.env.CASHEFREE_WEBHOOK_SECRET = originalSecret;
    }
    vi.restoreAllMocks();
  });

  const sign = (timestamp: string, body: string, secret = "webhook_secret_123") =>
    createHmac("sha256", secret).update(`${timestamp}${body}`).digest("base64");

  it("accepts a valid signature (timestamp + rawBody, base64 HMAC-SHA256)", () => {
    const timestamp = "1720000000";
    const body = JSON.stringify({ event_type: "SUBSCRIPTION_PAYMENT_SUCCESS" });
    const signature = sign(timestamp, body);

    expect(
      verifyCashfreeWebhookSignature({ timestamp, rawBody: body, signature }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const timestamp = "1720000000";
    const original = JSON.stringify({ event_type: "SUBSCRIPTION_PAYMENT_SUCCESS" });
    const tampered = JSON.stringify({ event_type: "SUBSCRIPTION_PAYMENT_FAILED" });
    const signature = sign(timestamp, original);

    expect(
      verifyCashfreeWebhookSignature({ timestamp, rawBody: tampered, signature }),
    ).toBe(false);
  });

  it("rejects a missing timestamp or signature", () => {
    const timestamp = "1720000000";
    const body = "{}";
    expect(
      verifyCashfreeWebhookSignature({ timestamp: null, rawBody: body, signature: "x" }),
    ).toBe(false);
    expect(
      verifyCashfreeWebhookSignature({ timestamp, rawBody: body, signature: null }),
    ).toBe(false);
    expect(
      verifyCashfreeWebhookSignature({ timestamp: "", rawBody: body, signature: "" }),
    ).toBe(false);
  });

  it("rejects when the webhook secret is not configured", () => {
    delete process.env.CASHEFREE_WEBHOOK_SECRET;
    const body = "{}";
    const signature = sign("1720000000", body, "unrelated");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      verifyCashfreeWebhookSignature({
        timestamp: "1720000000",
        rawBody: body,
        signature,
      }),
    ).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("rejects a signature from the wrong secret", () => {
    const timestamp = "1720000000";
    const body = "{}";
    const signature = sign(timestamp, body, "different_secret");
    expect(
      verifyCashfreeWebhookSignature({ timestamp, rawBody: body, signature }),
    ).toBe(false);
  });
});

describe("cashfree amount conversion (paise ↔ rupees)", () => {
  it("converts paise to whole rupees (Cashfree PG API unit)", () => {
    expect(cashfreeAmountFromPaise(99900)).toBe(999);
    expect(cashfreeAmountFromPaise(249900)).toBe(2499);
    expect(cashfreeAmountFromPaise(50)).toBe(1); // rounds 0.5 → 1
  });

  it("converts rupees back to paise", () => {
    expect(cashfreeAmountToPaise(999)).toBe(99900);
    expect(cashfreeAmountToPaise(2499)).toBe(249900);
  });
});

describe("mapCashfreeSubscriptionStatus", () => {
  it("maps known PG statuses to local statuses", () => {
    expect(mapCashfreeSubscriptionStatus("ACTIVE")).toBe("active");
    expect(mapCashfreeSubscriptionStatus("INITIALIZED")).toBe("trialing");
    expect(mapCashfreeSubscriptionStatus("AUTH_INITIATED")).toBe("trialing");
    expect(mapCashfreeSubscriptionStatus("ON_HOLD")).toBe("past_due");
    expect(mapCashfreeSubscriptionStatus("AUTH_FAILED")).toBe("past_due");
    expect(mapCashfreeSubscriptionStatus("PAUSED")).toBe("suspended");
    expect(mapCashfreeSubscriptionStatus("CANCELLED")).toBe("cancelled");
    expect(mapCashfreeSubscriptionStatus("COMPLETED")).toBe("cancelled");
    expect(mapCashfreeSubscriptionStatus("EXPIRED")).toBe("expired");
  });

  it("defaults unknown/undefined statuses to trialing (idempotent gate)", () => {
    expect(mapCashfreeSubscriptionStatus(undefined)).toBe("trialing");
    expect(mapCashfreeSubscriptionStatus("SOME_NEW_STATUS")).toBe("trialing");
  });
});