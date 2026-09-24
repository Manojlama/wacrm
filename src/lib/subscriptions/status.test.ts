import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_RANK,
  canReactivate,
  canReadProduct,
  canUseProduct,
  isSubscriptionStatus,
  isTerminal,
} from "./status";

describe("SUBSCRIPTION_STATUS_RANK", () => {
  it("orders trialing < active < past_due < grace_period < suspended < cancelled < expired", () => {
    const order = [
      "trialing",
      "active",
      "past_due",
      "grace_period",
      "suspended",
      "cancelled",
      "expired",
    ] as const;
    for (let i = 1; i < order.length; i++) {
      expect(SUBSCRIPTION_STATUS_RANK[order[i]]).toBeGreaterThan(
        SUBSCRIPTION_STATUS_RANK[order[i - 1]],
      );
    }
  });
});

describe("isSubscriptionStatus", () => {
  it("accepts every valid status", () => {
    for (const s of SUBSCRIPTION_STATUSES) {
      expect(isSubscriptionStatus(s)).toBe(true);
    }
  });

  it("rejects garbage", () => {
    expect(isSubscriptionStatus("paid")).toBe(false);
    expect(isSubscriptionStatus("")).toBe(false);
    expect(isSubscriptionStatus(null)).toBe(false);
    expect(isSubscriptionStatus(123)).toBe(false);
  });
});

describe("canUseProduct", () => {
  it("allows trialing and active", () => {
    expect(canUseProduct("trialing")).toBe(true);
    expect(canUseProduct("active")).toBe(true);
  });

  it("blocks everything else", () => {
    for (const s of ["past_due", "grace_period", "suspended", "cancelled", "expired"] as const) {
      expect(canUseProduct(s)).toBe(false);
    }
  });
});

describe("canReadProduct", () => {
  it("allows read during grace periods but not after hard stop", () => {
    expect(canReadProduct("trialing")).toBe(true);
    expect(canReadProduct("active")).toBe(true);
    expect(canReadProduct("past_due")).toBe(true);
    expect(canReadProduct("grace_period")).toBe(true);
    expect(canReadProduct("suspended")).toBe(false);
    expect(canReadProduct("cancelled")).toBe(false);
    expect(canReadProduct("expired")).toBe(false);
  });
});

describe("canReactivate", () => {
  it("allows reactivation from all non-active/non-trialing states", () => {
    expect(canReactivate("cancelled")).toBe(true);
    expect(canReactivate("suspended")).toBe(true);
    expect(canReactivate("expired")).toBe(true);
    expect(canReactivate("past_due")).toBe(true);
    expect(canReactivate("grace_period")).toBe(true);
    expect(canReactivate("active")).toBe(false);
    expect(canReactivate("trialing")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("only cancelled is terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("expired")).toBe(false);
    expect(isTerminal("suspended")).toBe(false);
  });
});

describe("SUBSCRIPTION_STATUS_LABELS", () => {
  it("has a label for every status", () => {
    for (const s of SUBSCRIPTION_STATUSES) {
      expect(typeof SUBSCRIPTION_STATUS_LABELS[s]).toBe("string");
      expect(SUBSCRIPTION_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });
});