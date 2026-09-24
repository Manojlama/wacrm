import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { getAdminMetrics } from "@/lib/admin/metrics";

export const runtime = "nodejs";

/** GET /api/admin/metrics — super-admin revenue/usage overview. */
export async function GET() {
  try {
    await requireSuperAdmin();
    const metrics = await getAdminMetrics();
    return NextResponse.json({ ...metrics });
  } catch (err) {
    return toErrorResponse(err);
  }
}