import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, HelpCircle, Minus } from "lucide-react";
import { branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

// ============================================================
// Public pricing page. Static English-only content mirroring the
// seeded plans in supabase/migrations/040_saaS_billing_system.sql
// (monthly_price stored in paise). Prices and caps below are
// display copies of that seed data — change either with care.
// ============================================================

type Tier = {
  name: string;
  monthly: string;
  yearly: string;
  tagline: string;
  highlight?: boolean;
  caps: { agents: number; contacts: number; broadcasts: number; automations: number; whatsapp: number };
  features: (string | { label: string; included: boolean })[];
};

const tiers: Tier[] = [
  {
    name: "Starter",
    monthly: "₹999",
    yearly: "₹9,990",
    tagline: "Perfect for small teams getting started with WhatsApp CRM",
    caps: {
      agents: 2,
      contacts: 1000,
      broadcasts: 100,
      automations: 5,
      whatsapp: 1,
    },
    features: [
      "Unified WhatsApp inbox",
      "Template broadcasts & drafts",
      "Basic automation rules",
      "Deals & pipelines",
      "Email support",
      { label: "AI reply assistant", included: false },
      { label: "REST API & webhooks", included: false },
      { label: "Advanced automation", included: false },
    ],
  },
  {
    name: "Growth",
    monthly: "₹2,499",
    yearly: "₹24,990",
    tagline: "For growing teams that need more power and automation",
    highlight: true,
    caps: {
      agents: 5,
      contacts: 5000,
      broadcasts: 500,
      automations: 20,
      whatsapp: 2,
    },
    features: [
      "Everything in Starter",
      "AI reply assistant",
      "Advanced automation",
      "Priority email support",
      { label: "REST API & webhooks", included: false },
    ],
  },
  {
    name: "Pro",
    monthly: "₹4,999",
    yearly: "₹49,990",
    tagline: "For established teams requiring advanced features and API access",
    caps: {
      agents: 15,
      contacts: 25000,
      broadcasts: 2000,
      automations: 100,
      whatsapp: 3,
    },
    features: [
      "Everything in Growth",
      "REST API & webhooks",
      "Message templates & flows at scale",
      "Priority email support",
    ],
  },
  {
    name: "Agency",
    monthly: "₹9,999",
    yearly: "₹99,990",
    tagline: "For agencies managing multiple clients and large volumes",
    caps: {
      agents: 50,
      contacts: 100000,
      broadcasts: 10000,
      automations: 500,
      whatsapp: 10,
    },
    features: [
      "Everything in Pro",
      "Highest volume limits",
      "Up to 10 WhatsApp numbers",
      "Dedicated support",
    ],
  },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "How does the free trial work?",
    a: `Every plan starts with a ${branding.trialDays}-day free trial. No payment method is required up front, and you're automatically downgraded to a free workspace (or choose a plan) when it ends.`,
  },
  {
    q: "What happens if I cancel or let a subscription lapse?",
    a: "Your data is never deleted. The workspace becomes read-only, and you can reactivate any time to continue where you left off.",
  },
  {
    q: "Are prices per agent or per workspace?",
    a: "Per workspace. One subscription covers the whole team up to the plan's agent limit — add teammates without adding seats.",
  },
  {
    q: "What are the usage limits on each plan?",
    a: "Contacts, broadcasts sent, automation runs, and connected WhatsApp numbers are capped per month (or per workspace for numbers). The card above shows the caps for each plan.",
  },
  {
    q: "Do I need a WhatsApp Business API account on top of this?",
    a: `Yes — ${branding.name} uses the official WhatsApp Business Platform. You'll connect your own WhatsApp Business number; our setup wizard walks you through it.`,
  },
  {
    q: "Can I self-host or white-label?",
    a: "Yes. The public name, support email, and brand color are configured via environment variables. Contact {email} for self-hosting questions.".replace(
      "{email}",
      branding.supportEmail,
    ),
  },
];

function Row({
  label,
  included,
}: {
  label: string;
  included: boolean;
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {included ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
      )}
      <span className={cn(!included && "text-muted-foreground/70")}>
        {label}
      </span>
    </li>
  );
}

function CapRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function generateMetadata() {
  return { title: "Pricing" };
}

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-16 pb-16 pt-10 sm:gap-20">
      <section className="marketing-container text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Pricing
        </p>
        <h1 className="mt-2 text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
          Simple plans, honest limits
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Start with a {branding.trialDays}-day free trial. Monthly or
          yearly billing — yearly plans include 2 months free.
        </p>
      </section>

      <section className="marketing-container">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-xl border glass-card p-6",
                tier.highlight
                  ? "border-2 border-primary shadow-md"
                  : "border-border",
              )}
            >
              {tier.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}
              <p className="text-sm font-semibold">{tier.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier.tagline}
              </p>
              <p className="mt-4 text-3xl font-bold">
                {tier.monthly}
                <span className="text-sm font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tier.yearly} billed yearly
              </p>

              <Link
                href="/signup"
                className={cn(
                  "mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90",
                  tier.highlight
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>

              <div className="mt-6">
                <CapRow label="Agents" value={`Up to ${tier.caps.agents}`} />
                <CapRow label="Contacts" value={`${tier.caps.contacts.toLocaleString("en-IN")}`} />
                <CapRow label="Broadcasts / month" value={`${tier.caps.broadcasts.toLocaleString("en-IN")}`} />
                <CapRow label="Automations" value={`${tier.caps.automations}`} />
                <CapRow label="WhatsApp numbers" value={`${tier.caps.whatsapp}`} />
              </div>

              <ul className="mt-5 flex flex-col gap-2.5">
                {tier.features.map((f) =>
                  typeof f === "string" ? (
                    <Row key={f} label={f} included />
                  ) : (
                    <Row key={f.label} label={f.label} included={f.included} />
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>Need help choosing? Reach us at</span>
          <a
            href={`mailto:${branding.supportEmail}`}
            className="break-all font-medium text-primary hover:underline"
          >
            {branding.supportEmail}
          </a>
        </p>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Pricing FAQ
        </h2>
        <div className="mt-8 divide-y divide-border rounded-xl border border-border glass-card">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4 open:bg-muted/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                {f.q}
                <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}