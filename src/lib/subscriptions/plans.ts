// ============================================================
// Plan catalog helpers
//
// Plans are stored in the DB (migration 040) and configurable from
// the super-admin panel. Prices are never hardcoded in components —
// always resolved through these helpers. Service-role only; plan
// rows are readable by anon (for the public pricing page) but that
// read goes through the RLS `plans_select` policy on the anon key,
// not here.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Plan } from "@/types/subscription";

/**
 * Fetch the active public plans, ordered by sort_order.
 * Bypasses RLS (service role) so the super-admin also sees
 * inactive plans via { includeInactive }.
 */
export async function getPlans(opts: { includeInactive?: boolean } = {}): Promise<Plan[]> {
  const admin = supabaseAdmin();
  let query = admin
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });

  if (!opts.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getPlans] failed:", error);
    throw new Error("Failed to load plans");
  }
  return (data ?? []) as Plan[];
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    console.error(`[getPlanById] failed for ${planId}:`, error);
    throw new Error("Failed to load plan");
  }
  return (data as Plan | null) ?? null;
}

export async function getPlanByName(name: string): Promise<Plan | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    console.error(`[getPlanByName] failed for ${name}:`, error);
    throw new Error("Failed to load plan");
  }
  return (data as Plan | null) ?? null;
}

/** The account_id's active subscription together with its plan. */
export async function getActiveSubscription(
  accountId: string,
): Promise<{ subscription: import("@/types/subscription").Subscription; plan: Plan } | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, plan:plans(*)")
    .eq("account_id", accountId)
    .in("status", ["trialing", "active", "past_due", "grace_period"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error(`[getActiveSubscription] failed for ${accountId}:`, error);
    throw new Error("Failed to load subscription");
  }
  if (!data) return null;

  const sub = data as import("@/types/subscription").Subscription & {
    plan: Plan | null;
  };
  if (!sub.plan) return null;

  return { subscription: sub, plan: sub.plan };
}

/** The account's most recent subscription row regardless of state. */
export async function getLatestSubscription(
  accountId: string,
): Promise<import("@/types/subscription").Subscription | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error(`[getLatestSubscription] failed for ${accountId}:`, error);
    throw new Error("Failed to load subscription");
  }
  return (data as import("@/types/subscription").Subscription | null) ?? null;
}