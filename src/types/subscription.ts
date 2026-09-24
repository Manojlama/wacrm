// ============================================================
// SaaS subscription types
//
// Mirrors migration 040_saaS_billing_system.sql. Prices are in
// paise (₹0.01) to match Razorpay's integer minor-unit amounts.
// ============================================================

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace_period"
  | "suspended"
  | "cancelled"
  | "expired";

export type BillingCycle = "monthly" | "yearly";

/** Payment gateway a plan/account/subscription is billed through. */
export type BillingProvider = "razorpay" | "cashfree";

export interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  /** Monthly price in paise (₹0.01). */
  monthly_price: number;
  /** Yearly price in paise (₹0.01). */
  yearly_price: number;
  max_agents: number;
  max_contacts: number;
  max_broadcasts: number;
  max_automations: number;
  max_whatsapp_numbers: number;
  ai_enabled: boolean;
  api_enabled: boolean;
  advanced_automation: boolean;
  support_level: string;
  razorpay_plan_id_monthly: string | null;
  razorpay_plan_id_yearly: string | null;
  cashfree_plan_id_monthly: string | null;
  cashfree_plan_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  account_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  billing_provider: BillingProvider;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  cashfree_customer_id: string | null;
  cashfree_subscription_id: string | null;
  cashfree_plan_id: string | null;
  trial_starts_at: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  grace_period_ends_at: string | null;
  failed_payment_count: number;
  created_at: string;
  updated_at: string;
  plan?: Plan;
}

export interface SubscriptionEvent {
  id: string;
  event_id: string;
  event_type: string;
  account_id: string | null;
  subscription_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  account_id: string;
  subscription_id: string | null;
  gateway: BillingProvider;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  cashfree_payment_id: string | null;
  /** Amount in paise. */
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  billing_reason: string | null;
  invoice_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  account_id: string;
  metric: string;
  count: number;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

export type AuditAction =
  | "subscription_changed"
  | "plan_changed"
  | "customer_suspended"
  | "customer_activated"
  | "whatsapp_connected"
  | "whatsapp_disconnected"
  | "member_added"
  | "member_removed"
  | "admin_impersonation_started"
  | "admin_impersonation_ended"
  | "trial_extended"
  | "customer_cancelled"
  | "customer_reactivated"
  | "plan_price_updated"
  | "onboarding_completed"
  | "organization_updated"
  | "email_verified";

export interface AuditLog {
  id: string;
  account_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ============================================================
// Entitlement snapshot — what a plan allows
// ============================================================

export interface PlanEntitlements {
  max_agents: number;
  max_contacts: number;
  max_broadcasts: number;
  max_automations: number;
  max_whatsapp_numbers: number;
  ai_enabled: boolean;
  api_enabled: boolean;
  advanced_automation: boolean;
  support_level: string;
}

export interface UsageSnapshot {
  agents: { used: number; limit: number };
  contacts: { used: number; limit: number };
  broadcasts: { used: number; limit: number };
  automations: { used: number; limit: number };
  whatsapp_numbers: { used: number; limit: number };
}