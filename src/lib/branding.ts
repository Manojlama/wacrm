// ============================================================
// Public-facing brand values, sourced from env so the SaaS owner
// can rebrand without touching code (see .env.local.example →
// "BRANDING"). NEXT_PUBLIC_* vars are inlined at build time, so
// these are safe to read anywhere; TRIAL_DAYS is server-only and
// should only be used from server components.
// ============================================================

function primaryColor(): string | null {
  const raw = process.env.NEXT_PUBLIC_PRIMARY_COLOR?.trim();
  if (!raw) return null;
  const hex = raw.replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? hex : null;
}

export const branding = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "WACRM",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@wacrm.app",
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    "https://wacrm.app",
  primaryColor: primaryColor(),
  trialDays: Number(process.env.TRIAL_DAYS) || 14,
} as const;