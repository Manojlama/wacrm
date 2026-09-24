'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatPricePaise } from '@/lib/subscriptions/prices';
import { canReactivate } from '@/lib/subscriptions/status';
import type {
  BillingProvider,
  Invoice,
  Plan,
  Subscription,
  SubscriptionStatus,
  UsageSnapshot,
} from '@/types/subscription';

interface BillingSnapshot {
  subscription: Subscription | null;
  plan: Plan | null;
  usage: UsageSnapshot | null;
  invoices: Invoice[];
  plans: Plan[];
  billingProvider: BillingProvider;
  gateways: Record<
    string,
    { provider: BillingProvider; configured: boolean; label: string }
  >;
}

const METRIC_ORDER = [
  'agents',
  'contacts',
  'broadcasts',
  'automations',
  'whatsapp_numbers',
] as const;

export function BillingPage() {
  const t = useTranslations('Billing');
  const { isOwner, account } = useAuth();

  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing', { cache: 'no-store' });
      if (!res.ok) throw new Error('load_failed');
      const data = (await res.json()) as BillingSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (
      url: string,
      method: 'POST',
      body?: Record<string, unknown>,
      opts?: { action?: string },
    ) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          setError(payload.error ?? t('actionFailed'));
          return false;
        }
        if (opts?.action === 'checkout') {
          const payload = (await res.json()) as { checkout_url?: string };
          if (payload.checkout_url) {
            window.location.assign(payload.checkout_url);
            return true;
          }
        }
        await load();
        return true;
      } catch {
        setError(t('actionFailed'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const status = snapshot?.subscription?.status ?? null;
  const plan = snapshot?.plan ?? null;
  const usage = snapshot?.usage ?? null;

  const usageDims: { key: (typeof METRIC_ORDER)[number]; label: string }[] = METRIC_ORDER.map(
    (key) => ({
      key,
      label: t(`metric.${key}`),
    }),
  );

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageDesc')}</p>
      </div>

      {error ? (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t('loading')}
        </div>
      ) : snapshot ? (
        <div className="mt-6 grid gap-6">
          <PlanCard
            status={status}
            plan={plan}
            subscription={snapshot.subscription}
            isOwner={isOwner}
            busy={busy}
            gatewayReady={
              snapshot.gateways?.[snapshot.billingProvider]?.configured ?? false
            }
            onCheckout={() => run('/api/billing/checkout', 'POST', undefined, { action: 'checkout' })}
            onCancel={() => run('/api/billing/manage', 'POST', { action: 'cancel' })}
            onReactivate={() =>
              run('/api/billing/manage', 'POST', { action: 'reactivate' })
            }
          />

          <GatewayCard
            snapshot={snapshot}
            isOwner={isOwner}
            busy={busy}
            onSelect={(provider) =>
              run('/api/billing/gateway', 'POST', { provider })
            }
          />

          <PlansCard
            snapshot={snapshot}
            isOwner={isOwner}
            busy={busy}
            onSwitch={(planId) => run('/api/billing/upgrade', 'POST', { plan_id: planId })}
          />

          <UsageCard usage={usage} dims={usageDims} />

          <InvoicesCard
            invoices={snapshot.invoices}
            accountName={account?.name}
          />
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Current plan + status + primary actions
// ============================================================

function PlanCard({
  status,
  plan,
  subscription,
  isOwner,
  busy,
  gatewayReady,
  onCheckout,
  onCancel,
  onReactivate,
}: {
  status: SubscriptionStatus | null;
  plan: Plan | null;
  subscription: Subscription | null;
  isOwner: boolean;
  busy: boolean;
  gatewayReady: boolean;
  onCheckout: () => void;
  onCancel: () => void;
  onReactivate: () => void;
}) {
  const t = useTranslations('Billing');
  const tStatus = useTranslations('Billing.status');

  const renderStatus = (s: SubscriptionStatus) => (
    <Badge key={s}>{tStatus(s)}</Badge>
  );

  const trialEnd = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString()
    : null;
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base">
            {plan ? plan.display_name : t('noPlan')}
          </CardTitle>
          {plan ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatPricePaise(plan.monthly_price)}/mo
            </p>
          ) : null}
        </div>
        {status ? renderStatus(status) : null}
      </CardHeader>
      <CardContent>
        {subscription ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {trialEnd ? (
              <div>
                <dt className="text-muted-foreground">{t('trialEnds')}</dt>
                <dd className="mt-0.5 font-medium text-foreground" suppressHydrationWarning>
                  {trialEnd}
                </dd>
              </div>
            ) : null}
            {periodEnd && status === 'active' ? (
              <div>
                <dt className="text-muted-foreground">{t('renewsOn')}</dt>
                <dd className="mt-0.5 font-medium text-foreground" suppressHydrationWarning>
                  {periodEnd}
                </dd>
              </div>
            ) : null}
            {subscription.cancel_at_period_end ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t('cancelsAtEnd')}</dt>
                <dd className="mt-0.5">{t('cancelsAtEndDesc')}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {isOwner ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {status && ['trialing', 'past_due', 'grace_period'].includes(status) ? (
              <Button onClick={onCheckout} disabled={busy || !gatewayReady}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('payNow')}
              </Button>
            ) : null}

            {!gatewayReady &&
            status &&
            ['trialing', 'past_due', 'grace_period'].includes(status) ? (
              <p className="w-full text-xs text-muted-foreground">{t('gatewayNotLive')}</p>
            ) : null}

            {status && canReactivate(status) ? (
              <Button
                variant="secondary"
                onClick={onReactivate}
                disabled={busy}
              >
                {t('reactivate')}
              </Button>
            ) : null}

            {status && status === 'active' && !subscription?.cancel_at_period_end ? (
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={busy}
              >
                {t('cancelPlan')}
              </Button>
            ) : null}

            {status && status === 'trialing' && !subscription?.cancel_at_period_end ? (
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                {t('cancelTrial')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isOwner ? (
          <p className="mt-4 text-xs text-muted-foreground">{t('ownerOnly')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Payment gateway — which provider bills this account
// ============================================================

function GatewayCard({
  snapshot,
  isOwner,
  busy,
  onSelect,
}: {
  snapshot: BillingSnapshot;
  isOwner: boolean;
  busy: boolean;
  onSelect: (provider: BillingProvider) => void;
}) {
  const t = useTranslations('Billing');
  const gateways = Object.values(snapshot.gateways ?? {});
  if (gateways.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('gatewayTitle')}</CardTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('gatewayDesc')}</p>
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <div className="flex flex-wrap gap-3">
            {gateways.map((g) => {
              const active = g.provider === snapshot.billingProvider;
              const disabled = !g.configured || busy;
              return (
                <button
                  key={g.provider}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(g.provider)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? 'border-primary bg-primary-soft'
                      : 'border-border glass-card hover:border-primary/50'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-3 rounded-full border ${
                      active ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}
                  />
                  <span className="font-medium text-foreground">{g.label}</span>
                  {!g.configured ? (
                    <Badge variant="outline">{t('gatewayNotConfigured')}</Badge>
                  ) : null}
                  {active ? (
                    <Badge variant="default">{t('gatewayActive')}</Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('gatewayOwnerOnly', {
              provider:
                snapshot.gateways[snapshot.billingProvider]?.label ??
                snapshot.billingProvider,
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Plan catalog — switch/upgrade/downgrade
// ============================================================

function PlansCard({
  snapshot,
  isOwner,
  busy,
  onSwitch,
}: {
  snapshot: BillingSnapshot;
  isOwner: boolean;
  busy: boolean;
  onSwitch: (planId: string) => void;
}) {
  const t = useTranslations('Billing');
  const currentPlanId = snapshot.subscription?.plan_id;

  if (!snapshot.plans || snapshot.plans.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('plansTitle')}</CardTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('plansDesc')}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border p-4 ${
                isCurrent ? 'border-primary bg-primary-soft' : 'border-border glass-card'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {plan.display_name}
                </span>
                {isCurrent ? (
                  <Badge variant="default">{t('currentPlan')}</Badge>
                ) : null}
              </div>
              <div className="mt-2 text-lg font-bold text-foreground">
                {formatPricePaise(plan.monthly_price)}
                <span className="text-xs font-normal text-muted-foreground">
                  /{t('perMonth')}
                </span>
              </div>
              {plan.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {plan.description}
                </p>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>
                  {t('featureContacts', { n: plan.max_contacts })}
                </li>
                <li>
                  {t('featureAgents', { n: plan.max_agents })}
                </li>
                <li>{t('featureAi', { enabled: plan.ai_enabled ? t('yes') : t('no') })}</li>
              </ul>
              {isOwner ? (
                <div className="mt-auto pt-4">
                  <Button
                    variant={isCurrent ? 'secondary' : 'outline'}
                    size="sm"
                    className="w-full"
                    disabled={isCurrent || busy}
                    onClick={() => onSwitch(plan.id)}
                  >
                    {isCurrent ? t('yourPlan') : t('switchTo')}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Usage relative to plan caps
// ============================================================

function UsageCard({
  usage,
  dims,
}: {
  usage: UsageSnapshot | null;
  dims: { key: (typeof METRIC_ORDER)[number]; label: string }[];
}) {
  const t = useTranslations('Billing');

  if (!usage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('usageTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t('usageUnavailable')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('usageTitle')}</CardTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('usageDesc')}</p>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {dims.map(({ key, label }) => {
          const row = usage[key] ?? { used: 0, limit: 0 };
          const pct = row.limit > 0 ? Math.min(100, (row.used / row.limit) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-sm text-muted-foreground">
                  {row.used} / {row.limit}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 100
                      ? 'bg-destructive'
                      : pct >= 80
                        ? 'bg-amber-500'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Invoices
// ============================================================

function InvoicesCard({
  invoices,
  accountName,
}: {
  invoices: Invoice[];
  accountName?: string;
}) {
  const t = useTranslations('Billing');

  const statusLabel = (s: Invoice['status']) => t(`invoiceStatus.${s}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('invoicesTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noInvoices')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="pb-2 font-medium">{t('invoiceDate')}</th>
                <th className="pb-2 font-medium">{t('invoiceAmount')}</th>
                <th className="pb-2 font-medium">{t('invoiceStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 text-foreground" suppressHydrationWarning>
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-foreground">
                    {formatPricePaise(inv.amount)}
                  </td>
                  <td className="py-2.5">
                    <Badge
                      variant={inv.status === 'paid' ? 'default' : 'outline'}
                    >
                      {statusLabel(inv.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {accountName ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {t('billedTo', { name: accountName })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}