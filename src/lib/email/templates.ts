// ============================================================
// Reusable HTML email templates.
//
// Plain, dependency-free HTML strings with inline styles (the only
// styling most mail clients reliably honour). Brand values come
// from env at render time so the SaaS owner can rebrand without
// touching code.
// ============================================================

import { sendEmail, type SendEmailParams } from "@/lib/email/index";

function brand() {
  return {
    name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "WACRM",
    website: process.env.NEXT_PUBLIC_SITE_URL ?? "https://wacrm.app",
    supportEmail:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@wacrm.app",
  };
}

function shell({ title, bodyHtml }: { title: string; bodyHtml: string }) {
  const b = brand();
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:18px;font-weight:700;color:#0f172a;">${b.name}</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${title}</h1>
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;color:#94a3b8;font-size:13px;">
            <p style="margin:0 0 4px;">${b.name} — WhatsApp CRM for sales teams</p>
            <a href="${b.website}" style="color:#6366f1;text-decoration:none;">${b.website}</a>
            <br/>
            <a href="mailto:${b.supportEmail}" style="color:#64748b;">${b.supportEmail}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function buttonHref(href: string, label: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="border-radius:8px;background:#4f46e5;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
      </td></tr>
    </table>`;
}

// ============================================================
// Individual emails
// ============================================================

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  confirmUrl?: string;
}) {
  const { to, name, confirmUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Hi ${name},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;">Welcome to ${brand().name}! Your workspace is ready and your free trial has started.</p>
    ${confirmUrl ? buttonHref(confirmUrl, "Verify your email") : ""}
    <p style="color:#334155;font-size:15px;line-height:1.6;">If the button above doesn't work, copy this link into your browser:</p>
    <p style="color:#6366f1;font-size:13px;">${confirmUrl ?? ""}</p>
  `;
  return sendEmail({
    to,
    subject: `Welcome to ${brand().name} 🎉`,
    html: shell({ title: "You're in!", bodyHtml: body }),
  });
}

export async function sendTrialStartedEmail(params: {
  to: string;
  days: number;
  endDate: string;
  dashboardUrl: string;
}) {
  const { to, days, endDate, dashboardUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Your free trial is active for the next <strong>${days} days</strong>. The trial ends on <strong>${endDate}</strong> — no charge until then.</p>
    ${buttonHref(dashboardUrl, "Open your dashboard")}
    <p style="color:#334155;font-size:15px;line-height:1.6;">Add your WhatsApp number and start sending messages right away.</p>
  `;
  return sendEmail({
    to,
    subject: `Your ${days}-day free trial has started`,
    html: shell({ title: "Trial started", bodyHtml: body }),
  });
}

export async function sendTrialEndingSoonEmail(params: {
  to: string;
  endDate: string;
  billingUrl: string;
}) {
  const { to, endDate, billingUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Your free trial ends on <strong>${endDate}</strong>. To keep using ${brand().name}, choose a plan before then.</p>
    ${buttonHref(billingUrl, "Choose a plan")}
  `;
  return sendEmail({
    to,
    subject: "Your trial ends soon",
    html: shell({ title: "Trial ending soon", bodyHtml: body }),
  });
}

export async function sendPaymentSuccessfulEmail(params: {
  to: string;
  amount: string;
  nextBillingDate: string;
  billingUrl: string;
}) {
  const { to, amount, nextBillingDate, billingUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">We received your payment of <strong>${amount}</strong>. Your subscription is active until <strong>${nextBillingDate}</strong>.</p>
    ${buttonHref(billingUrl, "View your billing details")}
  `;
  return sendEmail({
    to,
    subject: "Payment received",
    html: shell({ title: "Payment successful", bodyHtml: body }),
  });
}

export async function sendPaymentFailedEmail(params: {
  to: string;
  amount: string;
  retryUrl: string;
}) {
  const { to, amount, retryUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">We couldn't process your payment of <strong>${amount}</strong>. Your subscription is on hold and will be suspended soon if payment isn't recovered.</p>
    ${buttonHref(retryUrl, "Update payment method")}
    <p style="color:#64748b;font-size:13px;">You can always reach us at ${brand().supportEmail}.</p>
  `;
  return sendEmail({
    to,
    subject: "Payment failed — action needed",
    html: shell({ title: "Payment failed", bodyHtml: body }),
  });
}

export async function sendSubscriptionActivatedEmail(params: {
  to: string;
  planName: string;
  billingUrl: string;
}) {
  const { to, planName, billingUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Your <strong>${planName}</strong> subscription is now active. Full access to all plan features is unlocked.</p>
    ${buttonHref(billingUrl, "View your plan")}
  `;
  return sendEmail({
    to,
    subject: `Your ${planName} subscription is active`,
    html: shell({ title: "Subscription activated", bodyHtml: body }),
  });
}

export async function sendSubscriptionCancelledEmail(params: {
  to: string;
  effectiveDate: string;
  billingUrl: string;
}) {
  const { to, effectiveDate, billingUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Your subscription will end on <strong>${effectiveDate}</strong>. You can continue using ${brand().name} until then, and your data stays safe.</p>
    ${buttonHref(billingUrl, "Rethink it? Reactivate")}
  `;
  return sendEmail({
    to,
    subject: "Your subscription has been cancelled",
    html: shell({ title: "Subscription cancelled", bodyHtml: body }),
  });
}

export async function sendSubscriptionExpiredEmail(params: {
  to: string;
  reactivateUrl: string;
}) {
  const { to, reactivateUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Your subscription has expired. Your data is safe — reactivate any time to pick up where you left off.</p>
    ${buttonHref(reactivateUrl, "Reactivate your subscription")}
  `;
  return sendEmail({
    to,
    subject: "Your subscription has expired",
    html: shell({ title: "Subscription expired", bodyHtml: body }),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}) {
  const { to, resetUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">Click below to reset your password. This link expires in 1 hour.</p>
    ${buttonHref(resetUrl, "Reset password")}
    <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  `;
  return sendEmail({
    to,
    subject: "Reset your password",
    html: shell({ title: "Password reset", bodyHtml: body }),
  });
}

export async function sendTeamInvitationEmail(params: {
  to: string;
  inviterName: string;
  orgName: string;
  inviteUrl: string;
}) {
  const { to, inviterName, orgName, inviteUrl } = params;
  const body = `
    <p style="color:#334155;font-size:15px;line-height:1.6;">${inviterName} invited you to join <strong>${orgName}</strong> on ${brand().name}.</p>
    ${buttonHref(inviteUrl, "Accept invitation")}
  `;
  return sendEmail({
    to,
    subject: `${inviterName} invited you to ${orgName}`,
    html: shell({ title: "You're invited!", bodyHtml: body }),
  });
}

export type { SendEmailParams }; // re-export for callers who need the type