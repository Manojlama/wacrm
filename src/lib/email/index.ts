// ============================================================
// Transactional email service (Resend)
//
// Uses Resend's REST API directly (no `resend` npm dependency).
// Server-side ONLY — the API key never leaves the server.
//
// All human-facing emails flow through `sendEmail`, which is a
// minimal wrapper so swapping providers later is a one-file change.
// ============================================================

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

export interface EmailAttachment {
  filename: string;
  content: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback. Optional — Resend can derive from html. */
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

function emailFrom(): string {
  return (
    process.env.RESEND_FROM_EMAIL ??
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
    "WACRM <onboarding@resend.dev>"
  );
}

/**
 * Send a transactional email. Throws `EmailError` on failure so
 * callers can decide whether to surface the error or log + continue.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fail loudly in dev so a missing secret is obvious, but never
    // crash background/message flows that call email best-effort.
    console.warn(
      "[email] RESEND_API_KEY not configured — skipping email to",
      Array.isArray(params.to) ? params.to.join(", ") : params.to,
    );
    throw new EmailError("Email provider is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from ?? emailFrom(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      ...(params.attachments?.length
        ? { attachments: params.attachments }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Resend failed (${res.status}): ${body}`);
    throw new EmailError(`Email send failed with status ${res.status}`);
  }
}