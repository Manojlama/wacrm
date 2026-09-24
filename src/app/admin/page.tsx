import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/subscriptions/status";
import { formatPricePaise } from "@/lib/subscriptions/prices";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { getAdminMetrics } from "@/lib/admin/metrics";
import type { SubscriptionStatus } from "@/types/subscription";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  try {
    await requireSuperAdmin();
  } catch {
    notFound();
  }

  const m = await getAdminMetrics();

  const statCards: { label: string; value: string; tone?: "default" | "accent" }[] = [
    { label: "MRR", value: formatPricePaise(m.revenue.mrrPaise), tone: "accent" },
    { label: "ARR", value: formatPricePaise(m.revenue.arrPaise) },
    { label: "Paying accounts", value: String(m.revenue.payingAccounts) },
    { label: "Active trials", value: String(m.revenue.trialsActive) },
    { label: "Total accounts", value: String(m.accounts.total) },
    { label: "New signups (30d)", value: String(m.accounts.newSignups30d) },
    {
      label: "Churned (30d)",
      value: `${m.churn.churned30d} (${m.churn.churnRate30dPct}%)`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, accounts, and churn across the platform.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className={card.tone === "accent" ? "border-primary" : ""}>
            <CardContent className="px-4 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account status split */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accounts by status</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {SUBSCRIPTION_STATUSES.map((s) => (
                  <tr key={s} className="border-b border-border last:border-0">
                    <td className="py-2 text-foreground">
                      {SUBSCRIPTION_STATUS_LABELS[s]}
                    </td>
                    <td className="py-2 text-right font-medium text-foreground">
                      {m.accounts.byStatus[s] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Plan distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paying accounts by plan</CardTitle>
          </CardHeader>
          <CardContent>
            {m.plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paying accounts yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {m.plans.map((row) => (
                    <tr key={row.plan} className="border-b border-border last:border-0">
                      <td className="py-2 text-foreground">{row.plan}</td>
                      <td className="py-2 text-right font-medium text-foreground">
                        {row.accounts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {m.recentAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {m.recentAccounts.map((acct) => (
                  <tr key={acct.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium text-foreground">{acct.name}</td>
                    <td className="py-2.5 text-muted-foreground">{acct.plan ?? "—"}</td>
                    <td className="py-2.5">
                      <StatusBadge status={acct.status} />
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {new Date(acct.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const tone =
    status === "active" || status === "trialing"
      ? ("default" as const)
      : status === "past_due" || status === "grace_period"
        ? ("secondary" as const)
        : ("outline" as const);
  return <Badge variant={tone}>{SUBSCRIPTION_STATUS_LABELS[status]}</Badge>;
}