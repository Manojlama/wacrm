// ============================================================
// Server-side super-admin gate for admin API routes + pages.
//
// The middleware already routes non-super-admins away from
// /admin/*, but pages/API routes must NOT rely on that alone —
// middleware can be bypassed and is best-effort. Every admin
// surface independently re-checks the caller here (defense in
// depth): a user must have a live Supabase session AND an email
// listed in SUPER_ADMIN_EMAILS.
// ============================================================

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "./super-admin";

export interface SuperAdminContext {
  userId: string;
  email: string;
}

/**
 * Throws `UnauthorizedError` (no session) or `ForbiddenError`
 * (signed in but not a super-admin). Returns the user id + email on
 * success. Call from inside a try/catch that uses `toErrorResponse`.
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  if (!isSuperAdminEmail(user.email)) {
    throw new ForbiddenError("Super-admin access required");
  }

  return { userId: user.id, email: user.email ?? "" };
}

/** Whether to show the admin nav at all (avoid surfacing /admin to tenants). */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    await requireSuperAdmin();
    return true;
  } catch {
    return false;
  }
}