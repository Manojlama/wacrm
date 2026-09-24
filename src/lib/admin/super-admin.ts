// ============================================================
// Super-admin detection — server + client safe.
//
// Reads the SUPER_ADMIN_EMAILS env var (comma-separated). A user
// whose email is listed is a platform super-admin and can access
// the /admin routes. This is intentionally lightweight — it does
// NOT give a super-admin any implicit tenant membership; it only
// gates the super-admin dashboard routes.
// ============================================================

export function superAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

/** True when any super-admin emails are configured at all. */
export function superAdminConfigured(): boolean {
  return superAdminEmails().length > 0;
}