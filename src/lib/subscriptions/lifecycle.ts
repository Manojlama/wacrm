// ============================================================
// Subscription lifecycle service
//
// Server-side operations that mutate subscription state. These are
// called from customer billing routes (owner-only), admin routes,
// and scheduled jobs. Every mutation writes an audit log entry.
//
// Never deletes customer data on expiry/cancel/suspend — that's a
// hard rule from the spec.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAuditLog, type AuditLogInput } from "@/lib/audit";
import { getPlanById } from "@/lib/subscriptions/plans";
import {
  cancelRazorpaySubscription,
  createRazorpayCustomer,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  updateRazorpaySubscription,
} from "@/lib/subscriptions/razorpay";
import {
  cancelCashfreeSubscription,
  createCashfreePlan,
  createCashfreeSubscription,
  fetchCashfreeSubscription,
  isCashfreeConfigured,
} from "@/lib/subscriptions/cashfree";
import {
  getAccountProvider,
  isBillingProvider,
  planIdForProvider,
} from "@/lib/subscriptions/gateway";
import type {
  AuditAction,
  BillingProvider,
  Plan,
} from "@/types/subscription";

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 14);

export class SubscriptionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SubscriptionError";
    this.status = status;
  }
}

interface AuditCtx {
  actorUserId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
}

async function audit(
  accountId: string,
  action: AuditAction,
  ctx: AuditCtx,
  details?: Record<string, unknown>,
) {
  const input: AuditLogInput = {
    accountId,
    actorUserId: ctx.actorUserId ?? null,
    actorEmail: ctx.actorEmail ?? null,
    action,
    resourceType: "subscription",
    details: details ?? null,
    ipAddress: ctx.ip ?? null,
  };
  await recordAuditLog(input);
}

// ============================================================
// Handlers
// ============================================================

/**
 * Create the account's first subscription (trial). Also creates the
 * billing provider's customer + plan links so later charges reference
 * a stable customer id. Respects the account's chosen
 * `billing_provider` (razorpay | cashfree).
 */
export async function startTrial(params: {
  accountId: string;
  planName?: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string;
  days?: number;
  auditCtx?: AuditCtx;
}): Promise<{ subscriptionId: string }> {
  const admin = supabaseAdmin();
  const { getPlanByName } = await import("@/lib/subscriptions/plans");
  const plan = await getPlanByName(params.planName ?? "starter");
  if (!plan) throw new SubscriptionError("Plan not found", 404);

  const days = params.days ?? TRIAL_DAYS;
  const trialEnds = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // The gateway may be unconfigured (no keys in env) in dev/staging.
  // The local subscription must still start so plan selection and usage
  // enforcement work end-to-end; the gateway links get backfilled at
  // real checkout.
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, billing_provider, razorpay_customer_id, cashfree_customer_id")
    .eq("id", params.accountId)
    .maybeSingle();

  const providerRaw = (account?.billing_provider as unknown) ?? "razorpay";
  const provider: BillingProvider = isBillingProvider(providerRaw) ? providerRaw : "razorpay";

  // 1. Ensure the plan has a provider plan id (create + backfill if unset).
  let planProviderId = planIdForProvider(plan, provider, "monthly");
  if (!planProviderId && isProviderConfiguredForStart(provider)) {
    if (provider === "cashfree") {
      const cfPlan = await createCashfreePlan({
        planId: `wacrm-${plan.name}-monthly`,
        name: plan.display_name,
        amountPaise: plan.monthly_price,
        cycle: "monthly",
      });
      planProviderId = cfPlan.plan_id;
      await admin
        .from("plans")
        .update({ cashfree_plan_id_monthly: cfPlan.plan_id })
        .eq("id", plan.id);
    } else {
      const { createRazorpayPlan } = await import("@/lib/subscriptions/razorpay");
      const rzPlan = await createRazorpayPlan({
        name: plan.display_name,
        amount: plan.monthly_price,
        period: "monthly",
      });
      planProviderId = rzPlan.id;
      await admin
        .from("plans")
        .update({ razorpay_plan_id_monthly: rzPlan.id })
        .eq("id", plan.id);
    }
  }

  // 2. Resolve the provider customer id (idempotent per account).
  let providerCustomerId: string | null = null;
  if (provider === "cashfree") {
    // Cashfree PG creates/disambiguates customers inline on the
    // subscription object — no separate customer API. We mint a stable
    // id here so renewals/plan-swaps reuse one customer.
    providerCustomerId =
      (account?.cashfree_customer_id as string | null) ??
      `wacrm_${params.accountId.replace(/-/g, "")}`;
  } else {
    const rzCustomerId = account?.razorpay_customer_id as string | null | undefined;
    if (isProviderConfiguredForStart("razorpay") && !rzCustomerId) {
      const customer = await createRazorpayCustomer({
        name: params.contactName || account?.name || "WACRM customer",
        email: params.contactEmail,
        contact: params.contactPhone,
      });
      providerCustomerId = customer.id;
    } else {
      providerCustomerId = (rzCustomerId as string | null) ?? null;
    }
  }

  // 3. Insert local subscription row with a trial period.
  const nowIso = new Date().toISOString();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .insert({
      account_id: params.accountId,
      plan_id: plan.id,
      status: "trialing",
      billing_cycle: "monthly",
      billing_provider: provider,
      ...(provider === "cashfree"
        ? {
            cashfree_customer_id: providerCustomerId,
            cashfree_plan_id: planProviderId,
            cashfree_subscription_id: null,
          }
        : {
            razorpay_customer_id: providerCustomerId,
            razorpay_plan_id: planProviderId,
            razorpay_subscription_id: null,
          }),
      trial_starts_at: nowIso,
      trial_ends_at: trialEnds.toISOString(),
      current_period_start: nowIso,
      current_period_end: trialEnds.toISOString(),
    })
    .select("id")
    .single();

  if (subErr) throw new SubscriptionError("Failed to create subscription");
  const subId = (sub as { id: string }).id;

  // 4. Create the provider subscription and link it. Failures are
  //    tolerated — the trial still runs; the link can be retried at
  //    checkout.
  if (providerCustomerId && planProviderId) {
    try {
      const remoteId = await createRemoteSubscription({
        provider,
        accountId: params.accountId,
        subId,
        planProviderId,
        providerCustomerId,
        contactEmail: params.contactEmail,
        contactName: params.contactName,
        contactPhone: params.contactPhone,
        plan,
      });
      await admin
        .from("subscriptions")
        .update(
          provider === "cashfree"
            ? { cashfree_subscription_id: remoteId }
            : { razorpay_subscription_id: remoteId },
        )
        .eq("id", subId);
    } catch (err) {
      console.error(`[startTrial] ${provider} subscription create failed:`, err);
    }
  }

  await admin
    .from("accounts")
    .update({
      subscription_status: "trialing",
      current_plan_id: plan.id,
      trial_ends_at: trialEnds.toISOString(),
      ...(provider === "cashfree"
        ? { cashfree_customer_id: providerCustomerId }
        : { razorpay_customer_id: providerCustomerId }),
    })
    .eq("id", params.accountId);

  await audit(params.accountId, "subscription_changed", params.auditCtx ?? {}, {
    plan: plan.name,
    status: "trialing",
    trial_days: days,
    provider,
  });

  return { subscriptionId: subId };
}

function isProviderConfiguredForStart(provider: BillingProvider): boolean {
  if (provider === "cashfree") return isCashfreeConfigured();
  // Razorpay keys may be absent; the trial still starts (checked later).
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function createRemoteSubscription(params: {
  provider: BillingProvider;
  accountId: string;
  subId: string;
  planProviderId: string;
  providerCustomerId: string;
  contactEmail: string;
  contactName: string;
  contactPhone?: string;
  plan: Plan;
}): Promise<string> {
  const {
    provider,
    accountId,
    subId,
    planProviderId,
    providerCustomerId,
    contactEmail,
    contactName,
    contactPhone,
    plan,
  } = params;

  if (provider === "cashfree") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const cfSub = await createCashfreeSubscription({
      subscriptionId: `wacrm_${subId.replace(/-/g, "")}`,
      planId: planProviderId,
      customerId: providerCustomerId,
      customerName:
        contactName || (contactEmail ? contactEmail.split("@")[0] : "WACRM customer"),
      customerEmail: contactEmail,
      customerPhone: contactPhone,
      ...(siteUrl ? { returnUrl: `${siteUrl}/billing?checkout=true` } : {}),
      amountPaise: plan.monthly_price,
      firstChargeDate: undefined,
    });
    return cfSub.subscription_id;
  }

  const rzSub = await createRazorpaySubscription({
    plan_id: planProviderId,
    customer_id: providerCustomerId,
    total_count: 36,
    customer_notify: 1,
    notes: { account_id: accountId, subscription_id: subId },
  });
  return rzSub.id;
}

/**
 * Fetch the provider's hosted checkout/auth URL for an account that
 * has a pending subscription (used to kick the customer to the hosted
 * checkout page). Razorpay short_url / Cashfree subscription_url.
 *
 * SELF-HEALING: if the account has no remote subscription id yet —
 * e.g. the gateway keys were added AFTER the trial started (migrations
 * / onboarding created the local row without a gateway link) — and the
 * gateway is configured, the remote subscription (+ plan/customer ids)
 * is created on demand so "Pay now" always has something to redirect to.
 */
export async function getCheckoutUrl(accountId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const provider = await getAccountProvider(admin, accountId);

  let remoteId: string | null = null;
  const { data: latestSub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSub) {
    if (provider === "cashfree") {
      remoteId = (latestSub.cashfree_subscription_id as string | null) ?? null;
    } else {
      remoteId = (latestSub.razorpay_subscription_id as string | null) ?? null;
    }
  }

  // Heal a missing remote link (gateway keys added after trial start).
  if (!remoteId && latestSub) {
    try {
      const healedId = await createRemoteSubscriptionForAccount(latestSub, provider, admin);
      if (healedId) remoteId = healedId;
    } catch (err) {
      console.error("[getCheckoutUrl] self-heal remote create failed:", err);
      return null;
    }
  }

  if (!latestSub || !remoteId) return null;

  try {
    if (provider === "cashfree") {
      const cfSub = await fetchCashfreeSubscription(remoteId);
      return cfSub.subscription_url ?? null;
    }
    const rzSub = await fetchRazorpaySubscription(remoteId);
    return rzSub.short_url ?? null;
  } catch (err) {
    console.error("[getCheckoutUrl] fetch failed:", err);
    return null;
  }
}

/**
 * Create the remote subscription for an account whose local row has no
 * gateway link yet, backfilling plan/customer ids as needed. Returns
 * the new remote subscription id, or null when nothing to do.
 */
async function createRemoteSubscriptionForAccount(
  sub: Record<string, unknown>,
  provider: BillingProvider,
  admin: import("@supabase/supabase-js").SupabaseClient,
): Promise<string | null> {
  const subId = (sub.id as string | null) ?? null;
  const accountId = (sub.account_id as string | null) ?? null;
  const planId = (sub.plan_id as string | null) ?? null;
  if (!subId || !accountId || !planId) return null;

  const plan = await getPlanById(planId);
  if (!plan) return null;

  const cycle = (sub.billing_cycle as "monthly" | "yearly") ?? "monthly";
  let planProviderId = planIdForProvider(plan, provider, cycle);

  // Backfill the provider plan id if the plan row hasn't registered one.
  if (!planProviderId && isConfiguredByProvider(provider)) {
    if (provider === "cashfree") {
      const cfPlan = await createCashfreePlan({
        planId: `wacrm-${plan.name}-${cycle}`,
        name: plan.display_name,
        amountPaise: cycle === "yearly" ? plan.yearly_price : plan.monthly_price,
        cycle,
      });
      planProviderId = cfPlan.plan_id;
      await admin
        .from("plans")
        .update(
          cycle === "yearly"
            ? { cashfree_plan_id_yearly: cfPlan.plan_id }
            : { cashfree_plan_id_monthly: cfPlan.plan_id },
        )
        .eq("id", plan.id);
    } else {
      const { createRazorpayPlan } = await import("@/lib/subscriptions/razorpay");
      const rzPlan = await createRazorpayPlan({
        name: plan.display_name,
        amount: cycle === "yearly" ? plan.yearly_price : plan.monthly_price,
        period: cycle,
      });
      planProviderId = rzPlan.id;
      await admin
        .from("plans")
        .update(
          cycle === "yearly"
            ? { razorpay_plan_id_yearly: rzPlan.id }
            : { razorpay_plan_id_monthly: rzPlan.id },
        )
        .eq("id", plan.id);
    }
  }
  if (!planProviderId) return null;

  // Resolve the provider customer id (create if missing).
  let providerCustomerId: string | null = null;
  if (provider === "cashfree") {
    providerCustomerId =
      (sub.cashfree_customer_id as string | null) ??
      `wacrm_${accountId.replace(/-/g, "")}`;
    await admin
      .from("accounts")
      .update({ cashfree_customer_id: providerCustomerId })
      .eq("id", accountId);
  } else {
    providerCustomerId = (sub.razorpay_customer_id as string | null) ?? null;
    if (!providerCustomerId) {
      const { data: account } = await admin
        .from("accounts")
        .select("name")
        .eq("id", accountId)
        .maybeSingle();
      const { data: ownerProfile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("account_id", accountId)
        .eq("account_role", "owner")
        .limit(1)
        .maybeSingle();
      const customer = await createRazorpayCustomer({
        name:
          (ownerProfile?.full_name as string | undefined) ??
          (account?.name as string | undefined) ??
          "WACRM customer",
        email: (ownerProfile?.email as string | undefined) ?? undefined,
      });
      providerCustomerId = customer.id;
      await admin
        .from("subscriptions")
        .update({ razorpay_customer_id: customer.id })
        .eq("id", subId);
      await admin
        .from("accounts")
        .update({ razorpay_customer_id: customer.id })
        .eq("id", accountId);
    }
  }
  if (!providerCustomerId) return null;

  const remoteId = await createRemoteSubscription({
    provider,
    accountId,
    subId,
    planProviderId,
    providerCustomerId,
    contactEmail: "",
    contactName: "",
    plan,
  });
  await admin
    .from("subscriptions")
    .update(
      provider === "cashfree"
        ? {
            cashfree_subscription_id: remoteId,
            cashfree_plan_id: planProviderId,
          }
        : {
            razorpay_subscription_id: remoteId,
            razorpay_plan_id: planProviderId,
          },
    )
    .eq("id", subId);
  return remoteId;
}

function isConfiguredByProvider(provider: BillingProvider): boolean {
  if (provider === "cashfree") return isCashfreeConfigured();
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Change the account's plan. If the provider is configured, the remote
 * subscription follows the switch; the local row switches immediately
 * so entitlement checks reflect the new caps.
 */
export async function changePlan(params: {
  accountId: string;
  newPlanId: string;
  billingCycle?: "monthly" | "yearly";
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  const plan = await getPlanById(params.newPlanId);
  if (!plan) throw new SubscriptionError("Target plan not found", 404);

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", params.accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) throw new SubscriptionError("No subscription to change", 404);

  const cycle = params.billingCycle ?? (sub.billing_cycle as "monthly" | "yearly") ?? "monthly";
  const providerRaw = sub.billing_provider ?? "razorpay";
  const provider: BillingProvider = isBillingProvider(providerRaw) ? providerRaw : "razorpay";
  const planProviderId = planIdForProvider(plan, provider, cycle);

  // 1. Update the remote subscription.
  if (planProviderId) {
    try {
      if (provider === "cashfree") {
        await changeCashfreePlan({
          admin,
          accountId: params.accountId,
          sub,
          plan,
          planProviderId,
          cycle,
        });
      } else if (sub.razorpay_subscription_id) {
        // Swap at cycle end so there's no mid-cycle double charge.
        await updateRazorpaySubscription(sub.razorpay_subscription_id, {
          plan_id: planProviderId,
          schedule_change_at: "cycle_end",
        });
      }
    } catch (err) {
      console.error(`[changePlan] ${provider} update failed:`, err);
      // Continue locally; reconciliation job will re-sync.
    }
  }

  // 2. Swap the local plan immediately.
  const { error: subErr } = await admin
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      billing_cycle: cycle,
      ...(provider === "cashfree"
        ? { cashfree_plan_id: planProviderId ?? sub.cashfree_plan_id }
        : { razorpay_plan_id: planProviderId ?? sub.razorpay_plan_id }),
    })
    .eq("id", sub.id);
  if (subErr) throw new SubscriptionError("Failed to update subscription");

  await admin
    .from("accounts")
    .update({ current_plan_id: plan.id })
    .eq("id", params.accountId);

  await audit(
    params.accountId,
    "plan_changed",
    params.auditCtx ?? {},
    { from_plan_id: sub.plan_id, to_plan_id: plan.id, cycle, provider },
  );
}

/**
 * Cashfree has no in-place plan swap. We create a fresh subscription
 * for the target plan scheduled against the current period end (so no
 * mid-cycle double charge) and leave the old remote subscription to
 * complete on its own. The local row is switched immediately.
 */
async function changeCashfreePlan(params: {
  admin: import("@supabase/supabase-js").SupabaseClient;
  accountId: string;
  sub: Record<string, unknown>;
  plan: Plan;
  planProviderId: string;
  cycle: "monthly" | "yearly";
}): Promise<void> {
  const { admin, accountId, sub, plan, planProviderId, cycle } = params;
  const subId = (sub.id as string) ?? "";
  const customerId =
    (sub.cashfree_customer_id as string | null) ??
    `wacrm_${accountId.replace(/-/g, "")}`;

  // Cashfree PG validates customer_details; reuse the account owner's
  // profile so a plan-swap creation doesn't send empty strings.
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("account_id", accountId)
    .eq("account_role", "owner")
    .limit(1)
    .maybeSingle();

  const nextPeriodEnd = sub.current_period_end as string | null;
  const cfSub = await createCashfreeSubscription({
    subscriptionId: `wacrm_${subId.replace(/-/g, "")}_${Date.now().toString(36)}`,
    planId: planProviderId,
    customerId,
    customerName:
      (ownerProfile?.full_name as string | undefined) ??
      (sub.account_name as string | undefined) ??
      "WACRM customer",
    customerEmail:
      (ownerProfile?.email as string | undefined) ?? (sub.customer_email as string | undefined) ?? "",
    customerPhone: (sub.customer_phone as string | undefined) ?? "",
    amountPaise: cycle === "yearly" ? plan.yearly_price : plan.monthly_price,
    ...(nextPeriodEnd
      ? { firstChargeDate: new Date(nextPeriodEnd).toISOString().slice(0, 10) }
      : {}),
  });

  if (cfSub.subscription_id) {
    await admin
      .from("subscriptions")
      .update({ cashfree_subscription_id: cfSub.subscription_id })
      .eq("id", subId);
  }
}

/**
 * Cancel the account's subscription (at period end by default).
 * Customer data is untouched.
 */
export async function cancelSubscription(params: {
  accountId: string;
  atPeriodEnd?: boolean;
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  const atPeriodEnd = params.atPeriodEnd ?? true;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", params.accountId)
    .in("status", ["trialing", "active", "past_due", "grace_period"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) throw new SubscriptionError("No active subscription", 404);

  const providerRaw = sub.billing_provider ?? "razorpay";
  const provider: BillingProvider = isBillingProvider(providerRaw) ? providerRaw : "razorpay";
  const remoteSubId =
    provider === "cashfree"
      ? (sub.cashfree_subscription_id as string | null)
      : (sub.razorpay_subscription_id as string | null);

  if (remoteSubId) {
    try {
      if (provider === "cashfree") {
        // Cashfree has no "cancel at period end" — cancelling stops
        // future charges immediately; the local row stays active until
        // the current period ends, so the customer keeps service.
        await cancelCashfreeSubscription(remoteSubId);
      } else {
        // cancel_at_cycle_end keeps service until the paid period ends.
        await cancelRazorpaySubscription(remoteSubId, atPeriodEnd);
      }
    } catch (err) {
      console.error(`[cancelSubscription] ${provider} cancel failed:`, err);
    }
  }

  const status = atPeriodEnd ? sub.status : "cancelled";
  await admin
    .from("subscriptions")
    .update({
      ...(atPeriodEnd ? { cancel_at_period_end: true } : { status, cancelled_at: new Date().toISOString() }),
    })
    .eq("id", sub.id);

  if (!atPeriodEnd) {
    await admin.from("accounts").update({ subscription_status: status }).eq("id", params.accountId);
  }

  await audit(params.accountId, "customer_cancelled", params.auditCtx ?? {}, {
    at_period_end: atPeriodEnd,
    provider,
    subscription_id: remoteSubId,
  });
}

/**
 * Reactivate a cancelled/past_due subscription. Requires the
 * Razorpay subscription to still be resumable (not terminated).
 */
export async function reactivateSubscription(params: {
  accountId: string;
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", params.accountId)
    .in("status", ["cancelled", "past_due", "grace_period", "suspended", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) throw new SubscriptionError("No subscription to reactivate", 404);

  await admin
    .from("subscriptions")
    .update({
      status: "active",
      cancel_at_period_end: false,
      cancelled_at: null,
      failed_payment_count: 0,
      grace_period_ends_at: null,
    })
    .eq("id", sub.id);

  await admin
    .from("accounts")
    .update({ subscription_status: "active" })
    .eq("id", params.accountId);

  await audit(params.accountId, "customer_reactivated", params.auditCtx ?? {}, {});
}

/**
 * Admin-initiated suspend (hard stop). Data is preserved, product
 * access is blocked until reactivated.
 */
export async function suspendSubscription(params: {
  accountId: string;
  reason?: string;
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  await admin
    .from("subscriptions")
    .update({ status: "suspended" })
    .eq("account_id", params.accountId);
  await admin
    .from("accounts")
    .update({ subscription_status: "suspended" })
    .eq("id", params.accountId);

  await audit(params.accountId, "customer_suspended", params.auditCtx ?? {}, {
    reason: params.reason ?? null,
  });
}

export async function activateSubscription(params: {
  accountId: string;
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  await admin.from("subscriptions").update({ status: "active" }).eq("account_id", params.accountId);
  await admin.from("accounts").update({ subscription_status: "active" }).eq("id", params.accountId);

  await audit(params.accountId, "customer_activated", params.auditCtx ?? {}, {});
}

export async function extendTrial(params: {
  accountId: string;
  days: number;
  auditCtx?: AuditCtx;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("account_id", params.accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) throw new SubscriptionError("No subscription found", 404);

  const base = sub.trial_ends_at
    ? new Date(sub.trial_ends_at).getTime()
    : Date.now();
  const newEnd = new Date(base + params.days * 24 * 60 * 60 * 1000);

  await admin
    .from("subscriptions")
    .update({ trial_ends_at: newEnd.toISOString() })
    .eq("id", sub.id);
  await admin.from("accounts").update({ trial_ends_at: newEnd.toISOString() }).eq("id", params.accountId);

  await audit(params.accountId, "trial_extended", params.auditCtx ?? {}, { days: params.days });
}