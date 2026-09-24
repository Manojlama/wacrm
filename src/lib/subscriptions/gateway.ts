// ============================================================
// Gateway dispatch helpers
//
// Small, side-effect-free helpers that pick the right provider
// columns/behaviours for a given `billing_provider`. All remote
// API calls live in the per-gateway clients (razorpay.ts /
// cashfree.ts); this module only resolves *which* provider an
// account uses and which plan/columns to read or write.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BillingCycle,
  BillingProvider,
  Plan,
} from "@/types/subscription";
import { isConfigured as razorpayConfigured } from "@/lib/subscriptions/razorpay";
import { isCashfreeConfigured as cashfreeConfigured } from "@/lib/subscriptions/cashfree";

export const BILLING_PROVIDERS = ["razorpay", "cashfree"] as const satisfies readonly BillingProvider[];

export function isBillingProvider(value: unknown): value is BillingProvider {
  return value === "razorpay" || value === "cashfree";
}

/** The primary plan id for a provider+cycle, or null if unset. */
export function planIdForProvider(
  plan: Pick<
    Plan,
    | "razorpay_plan_id_monthly"
    | "razorpay_plan_id_yearly"
    | "cashfree_plan_id_monthly"
    | "cashfree_plan_id_yearly"
  >,
  provider: BillingProvider,
  cycle: BillingCycle,
): string | null {
  if (provider === "cashfree") {
    return cycle === "yearly" ? plan.cashfree_plan_id_yearly : plan.cashfree_plan_id_monthly;
  }
  return cycle === "yearly" ? plan.razorpay_plan_id_yearly : plan.razorpay_plan_id_monthly;
}

/** Which provider a given account is billed through (default razorpay). */
export async function getAccountProvider(
  admin: SupabaseClient,
  accountId: string,
): Promise<BillingProvider> {
  const { data } = await admin
    .from("accounts")
    .select("billing_provider")
    .eq("id", accountId)
    .maybeSingle();
  const raw = (data as { billing_provider?: unknown } | null)?.billing_provider ?? "razorpay";
  return isBillingProvider(raw) ? raw : "razorpay";
}

export interface GatewayStatus {
  provider: BillingProvider;
  configured: boolean;
  label: string;
}

/** Whether each gateway has its env credentials configured. */
export function getGatewayStatus(): Record<BillingProvider, GatewayStatus> {
  return {
    razorpay: {
      provider: "razorpay",
      configured: razorpayConfigured(),
      label: "Razorpay",
    },
    cashfree: {
      provider: "cashfree",
      configured: cashfreeConfigured(),
      label: "Cashfree",
    },
  };
}

export function isProviderConfigured(provider: BillingProvider): boolean {
  return provider === "razorpay" ? razorpayConfigured() : cashfreeConfigured();
}