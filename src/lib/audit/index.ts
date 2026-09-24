// ============================================================
// Audit log helper — server-side only.
//
// Wraps the record_audit_log RPC (migration 040). The logs table is
// append-only (no UPDATE/DELETE RLS policies), so entries are
// tamper-evident from the SQL side too. Call sites pass whatever
// context they have; nothing user-controlled should ever get into
// `details` without being a plain JSON value.
// ============================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AuditAction } from "@/types/subscription";

export interface AuditLogInput {
  accountId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export async function recordAuditLog(input: AuditLogInput): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("record_audit_log", {
    p_account_id: input.accountId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_email: input.actorEmail ?? null,
    p_action: input.action,
    p_resource_type: input.resourceType ?? null,
    p_resource_id: input.resourceId ?? null,
    p_details: input.details ?? null,
    p_ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("[audit] failed to record:", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Audit from an API route using the caller's account context. */
export async function auditForAccount(
  ctx: { accountId: string; userId: string },
  action: AuditAction,
  opts: Omit<AuditLogInput, "accountId" | "actorUserId" | "action"> = {},
): Promise<string | null> {
  const { accountId, userId } = ctx;
  // context doesn't carry email; the RPC accepts null actor_email
  return recordAuditLog({ accountId, actorUserId: userId, action, ...opts });
}