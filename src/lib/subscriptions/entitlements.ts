// ============================================================
// Subscription entitlements + usage-limit enforcement
//
// Every plan carries a set of numeric caps. The backend MUST
// enforce these limits — the UI only reflects them. These helpers
// are the single source of truth for "can this account do X?".
//
// Call pattern (server-side):
//   const ctx = await requireRole("agent");
//   await assertCanCreate(ctx.accountId, "contacts");
//
// For counts: `getUsage(accountId, metric)` reads the current
// month window from usage_records; the DB `increment_usage` RPC
// atomically bumps counters on create.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveSubscription } from "@/lib/subscriptions/plans";
import type { Plan } from "@/types/subscription";

export type UsageMetric =
  | "contacts"
  | "agents"
  | "broadcasts"
  | "automations"
  | "whatsapp_numbers";

/** Which plan cap governs each metric. */
export const METRIC_PLAN_CAP: Record<UsageMetric, keyof Plan> = {
  contacts: "max_contacts",
  agents: "max_agents",
  broadcasts: "max_broadcasts",
  automations: "max_automations",
  whatsapp_numbers: "max_whatsapp_numbers",
};

export class EntitlementError extends Error {
  readonly status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

/**
 * Resolve the account's current plan + allows its entitlements.
 * Throws if the account has no subscription (pre-billing accounts
 * get a default 14-day trial of the Starter plan's caps).
 */
export async function getEntitlements(
  accountId: string,
): Promise<{ plan: Plan; limits: Plan }> {
  const active = await getActiveSubscription(accountId);
  if (active) {
    return { plan: active.plan, limits: active.plan };
  }

  // Account without a subscription row — very early signup or legacy
  // self-host import. Fall back to the Starter plan caps so the app
  // keeps working while billing hooks up.
  const { getPlanByName } = await import("@/lib/subscriptions/plans");
  const starter = await getPlanByName("starter");
  if (starter) return { plan: starter, limits: starter };

  // Last resort — generous hardcoded defaults (should never happen in
  // production, where migration 040 seeds the plans).
  const fallback: Plan = {
    id: "fallback",
    name: "fallback",
    display_name: "Fallback",
    description: null,
    monthly_price: 0,
    yearly_price: 0,
    max_agents: 1,
    max_contacts: 1000,
    max_broadcasts: 100,
    max_automations: 5,
    max_whatsapp_numbers: 1,
    ai_enabled: false,
    api_enabled: false,
    advanced_automation: false,
    support_level: "email",
    razorpay_plan_id_monthly: null,
    razorpay_plan_id_yearly: null,
    cashfree_plan_id_monthly: null,
    cashfree_plan_id_yearly: null,
    is_active: true,
    sort_order: 999,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { plan: fallback, limits: fallback };
}

/** Current period usage count for a metric (this month). */
export async function getUsage(
  accountId: string,
  metric: UsageMetric,
): Promise<number> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("get_usage", {
    p_account_id: accountId,
    p_metric: metric,
  });

  if (error) {
    console.error(`[getUsage] failed for ${accountId}/${metric}:`, error);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Atomically bump a usage counter. Returns the NEW count after the
 * increment. Service-role only (the RPC grant is service_role).
 */
export async function incrementUsage(
  accountId: string,
  metric: UsageMetric,
  by = 1,
): Promise<number> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("increment_usage", {
    p_account_id: accountId,
    p_metric: metric,
    p_increment: by,
  });

  if (error) {
    console.error(`[incrementUsage] failed for ${accountId}/${metric}:`, error);
    throw new Error("Failed to record usage");
  }
  return (data as number) ?? 0;
}

// ============================================================
// Guard helpers — call these from API routes before creating
// ============================================================

async function assertUnderCap(
  accountId: string,
  metric: UsageMetric,
): Promise<void> {
  const { limits } = await getEntitlements(accountId);
  const cap = limits[METRIC_PLAN_CAP[metric]] as number;
  const current = await getUsage(accountId, metric);

  if (current >= cap) {
    throw new EntitlementError(
      `Plan limit reached: ${current}/${cap} ${metric}. Upgrade to increase your limit.`,
    );
  }
}

export async function canCreateContact(accountId: string): Promise<void> {
  await assertUnderCap(accountId, "contacts");
}

export async function canCreateAgent(accountId: string): Promise<void> {
  await assertUnderCap(accountId, "agents");
}

export async function canCreateBroadcast(accountId: string): Promise<void> {
  await assertUnderCap(accountId, "broadcasts");
}

export async function canCreateAutomation(accountId: string): Promise<void> {
  await assertUnderCap(accountId, "automations");
}

export async function canConnectWhatsApp(accountId: string): Promise<void> {
  await assertUnderCap(accountId, "whatsapp_numbers");
}

export async function canUseAI(accountId: string): Promise<boolean> {
  const { limits } = await getEntitlements(accountId);
  return limits.ai_enabled;
}

export async function canUseAPI(accountId: string): Promise<boolean> {
  const { limits } = await getEntitlements(accountId);
  return limits.api_enabled;
}

export async function canUseAdvancedAutomation(accountId: string): Promise<boolean> {
  const { limits } = await getEntitlements(accountId);
  return limits.advanced_automation;
}

// ============================================================
// Usage snapshot — for the billing page + entitlement UI
// ============================================================

export async function getUsageSnapshot(
  accountId: string,
): Promise<Record<UsageMetric, { used: number; limit: number }>> {
  const { limits } = await getEntitlements(accountId);
  const metrics: UsageMetric[] = [
    "contacts",
    "agents",
    "broadcasts",
    "automations",
    "whatsapp_numbers",
  ];

  const entries = await Promise.all(
    metrics.map(async (m) => {
      const used = await getUsage(accountId, m);
      return [m, { used, limit: limits[METRIC_PLAN_CAP[m]] as number }];
    }),
  );

  return Object.fromEntries(entries) as Record<
    UsageMetric,
    { used: number; limit: number }
  >;
}