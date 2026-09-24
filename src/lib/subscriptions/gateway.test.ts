import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_PROVIDERS,
  getGatewayStatus,
  isBillingProvider,
  planIdForProvider,
} from "./gateway";

describe("isBillingProvider", () => {
  it("accepts the two supported providers", () => {
    expect(BILLING_PROVIDERS).toEqual(["razorpay", "cashfree"]);
    expect(isBillingProvider("razorpay")).toBe(true);
    expect(isBillingProvider("cashfree")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isBillingProvider("stripe")).toBe(false);
    expect(isBillingProvider(undefined)).toBe(false);
    expect(isBillingProvider(null)).toBe(false);
    expect(isBillingProvider("")).toBe(false);
  });
});

describe("planIdForProvider", () => {
  const plan = {
    razorpay_plan_id_monthly: "rz_monthly",
    razorpay_plan_id_yearly: "rz_yearly",
    cashfree_plan_id_monthly: "cf_monthly",
    cashfree_plan_id_yearly: "cf_yearly",
  };

  it("returns the matching plan id for the provider + cycle", () => {
    expect(planIdForProvider(plan, "razorpay", "monthly")).toBe("rz_monthly");
    expect(planIdForProvider(plan, "razorpay", "yearly")).toBe("rz_yearly");
    expect(planIdForProvider(plan, "cashfree", "monthly")).toBe("cf_monthly");
    expect(planIdForProvider(plan, "cashfree", "yearly")).toBe("cf_yearly");
  });

  it("returns null when the provider hasn't registered a plan id", () => {
    const empty = {
      razorpay_plan_id_monthly: null,
      razorpay_plan_id_yearly: null,
      cashfree_plan_id_monthly: null,
      cashfree_plan_id_yearly: null,
    };
    expect(planIdForProvider(empty, "cashfree", "yearly")).toBeNull();
    expect(planIdForProvider(empty, "razorpay", "monthly")).toBeNull();
  });
});

describe("getGatewayStatus", () => {
  const original = {
    id: process.env.CASHEFREE_CLIENT_ID,
    secret: process.env.CASHEFREE_CLIENT_SECRET,
    rzId: process.env.RAZORPAY_KEY_ID,
    rzSecret: process.env.RAZORPAY_KEY_SECRET,
  };

  afterEach(() => {
    if (original.id === undefined) delete process.env.CASHEFREE_CLIENT_ID;
    else process.env.CASHEFREE_CLIENT_ID = original.id;
    if (original.secret === undefined) delete process.env.CASHEFREE_CLIENT_SECRET;
    else process.env.CASHEFREE_CLIENT_SECRET = original.secret;
    if (original.rzId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = original.rzId;
    if (original.rzSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = original.rzSecret;
    vi.restoreAllMocks();
  });

  it("reports gateways as unconfigured without env keys", () => {
    delete process.env.CASHEFREE_CLIENT_ID;
    delete process.env.CASHEFREE_CLIENT_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const status = getGatewayStatus();
    expect(status.razorpay.configured).toBe(false);
    expect(status.cashfree.configured).toBe(false);
  });

  it("reports a gateway as configured when its env keys exist", () => {
    process.env.CASHEFREE_CLIENT_ID = "cf_id";
    process.env.CASHEFREE_CLIENT_SECRET = "cf_secret";

    const status = getGatewayStatus();
    expect(status.cashfree.configured).toBe(true);
    expect(status.razorpay.configured).toBe(false);
  });
});