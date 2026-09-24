// ============================================================
// Super-admin business metrics.
//
// All queries use the service-role client (no tenant scoping) and
// are called ONLY from super-admin-gated routes. Prices are paise.
// MRR/ARR conventions:
//   paid states   = active | past_due | grace_period (still collect)
//   MRR           = Σ over paid subs of (cycle==='monthly' ? monthly_price : yearly_price/12)
//   ARR           = Σ over paid subs of (cycle==='monthly' ? monthly_price*12 : yearly_price)
// Trials are NOT revenue — counted separately.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Plan, Subscription, SubscriptionStatus } from "@/types/subscription";

const PAID_STATUSES: SubscriptionStatus[] = ["active", "past_due", "grace_period"];

export interface AdminMetrics {
  accounts: {
    total: number;
    byStatus: Partial<Record<SubscriptionStatus, number>>;
    newSignups30d: number;
  };
  revenue: {
    mrrPaise: number;
    arrPaise: number;
    payingAccounts: number;
    trialsActive: number;
  };
  churn: {
    churned30d: number;
    churnRate30dPct: number;
  };
  plans: { plan: string; accounts: number }[];
  recentAccounts: {
    id: string;
    name: string;
    status: SubscriptionStatus | null;
    plan: string | null;
    created_at: string;
  }[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const admin = supabaseAdmin();

  // 1. Account volume + status split.
  const { count: total } = await admin
    .from("accounts")
    .select("id", { count: "exact", head: true });
  const byStatus: Partial<Record<SubscriptionStatus, number>> = {};
  const statuses: SubscriptionStatus[] = [
    "trialing",
    "active",
    "past_due",
    "grace_period",
    "suspended",
    "cancelled",
    "expired",
  ];
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await admin
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("subscription_status", s);
      byStatus[s] = count ?? 0;
    }),
  );

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const { count: newSignups30d } = await admin
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  // 2. Revenue + plan distribution from paid subscriptions.
  const { data: paidSubs, error: paidErr } = await admin
    .from("subscriptions")
    .select("*, plan:plans(id, name, display_name, monthly_price, yearly_price)")
    .in("status", PAID_STATUSES);
  if (paidErr) {
    console.error("[admin metrics] paid subscriptions fetch failed:", paidErr);
    throw new Error("Failed to load subscription metrics");
  }

  const subs = (paidSubs ?? []) as (Subscription & {
    plan: Partial<Plan> | null;
  })[];

  let mrrPaise = 0;
  let arrPaise = 0;
  const payingSet = new Set<string>();
  const planCounts = new Map<string, number>();

  for (const sub of subs) {
    if (!sub.plan) continue;
    payingSet.add(sub.account_id);
    const monthly = sub.plan.monthly_price ?? 0;
    const yearly = sub.plan.yearly_price ?? 0;
    if (sub.billing_cycle === "yearly") {
      mrrPaise += Math.round(yearly / 12);
      arrPaise += yearly;
    } else {
      mrrPaise += monthly;
      arrPaise += monthly * 12;
    }
    const label = sub.plan.display_name ?? sub.plan.name ?? "Unknown";
    planCounts.set(label, (planCounts.get(label) ?? 0) + 1);
  }

  const plans = [...planCounts.entries()]
    .map(([plan, accounts]) => ({ plan, accounts }))
    .sort((a, b) => b.accounts - a.accounts);

  // 3. Trials active (revenue-free but usage-bearing).
  const { data: trialing, error: trialErr } = await admin
    .from("accounts")
    .select("id")
    .eq("subscription_status", "trialing");
  const trialsActive = (trialing ?? []).length;
  if (trialErr) console.error("[admin metrics] trialing fetch failed:", trialErr);

  // 4. Churn: subs that ended in the last 30 days.
  const { data: ended, error: endedErr } = await admin
    .from("subscriptions")
    .select("status, cancelled_at, updated_at")
    .in("status", ["cancelled", "expired"]);
  if (endedErr) {
    console.error("[admin metrics] ended subs fetch failed:", endedErr);
  }
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const churned30d = (ended ?? []).filter((s) => {
    const ts = s.cancelled_at ?? s.updated_at;
    return ts ? new Date(ts).getTime() >= cutoff : false;
  }).length;

  const volatile = (byStatus.active ?? 0) + (byStatus.past_due ?? 0) + (byStatus.grace_period ?? 0);
  const churnRate30dPct =
    volatile + churned30d > 0 ? Math.round((churned30d / (volatile + churned30d)) * 100) : 0;

  // 5. Recent accounts for the admin list.
  const { data: recentRows, error: recentErr } = await admin
    .from("accounts")
    .select("id, name, subscription_status, current_plan_id, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentErr) console.error("[admin metrics] recent accounts fetch failed:", recentErr);

  const recentAccounts = await Promise.all(
    (recentRows ?? []).map(async (row) => {
      let plan: string | null = null;
      if (row.current_plan_id) {
        const { data: p } = await admin
          .from("plans")
          .select("display_name")
          .eq("id", row.current_plan_id)
          .maybeSingle();
        plan = p?.display_name ?? null;
      }
      return {
        id: row.id as string,
        name: row.name as string,
        status: (row.subscription_status as SubscriptionStatus) ?? null,
        plan,
        created_at: row.created_at as string,
      };
    }),
  );

  return {
    accounts: {
      total: total ?? 0,
      byStatus,
      newSignups30d: newSignups30d ?? 0,
    },
    revenue: {
      mrrPaise,
      arrPaise,
      payingAccounts: payingSet.size,
      trialsActive,
    },
    churn: {
      churned30d,
      churnRate30dPct,
    },
    plans,
    recentAccounts,
  };
}