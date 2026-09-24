import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  Check,
  Inbox,
  KanbanSquare,
  KeyRound,
  MessageSquare,
  Route,
  Send,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import { branding } from "@/lib/branding";

// ============================================================
// Public marketing landing. Static (no client JS needed) and
// intentionally English-only — consistent with the onboarding
// wizard. Product facts below mirror the seeded plans in
// supabase/migrations/040_saaS_billing_system.sql.
// ============================================================

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[clamp(1.65rem,4vw,2.35rem)] font-semibold leading-tight tracking-tight">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border glass-card p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

const features: {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: Inbox,
    title: "Unified WhatsApp inbox",
    body: "Every conversation in one place with 24-hour session timers, tags, notes, and assignment to teammates.",
  },
  {
    icon: Send,
    title: "Template broadcasts",
    body: "Reach thousands of contacts with approved WhatsApp templates, personalized variables, and delivery analytics.",
  },
  {
    icon: Workflow,
    title: "Automation builder",
    body: "React to inbound messages, keywords, button replies, and schedules — no code required.",
  },
  {
    icon: Bot,
    title: "AI reply assistant",
    body: "Bring your own OpenAI or Anthropic key to draft replies and auto-answer within the 24-hour window.",
  },
  {
    icon: KanbanSquare,
    title: "Deals & pipelines",
    body: "Track opportunities from first message to won with custom stages, values, and assignment.",
  },
  {
    icon: Route,
    title: "Conversation flows",
    body: "Build branching, button-driven menus for FAQs, onboarding, and triage before a human steps in.",
  },
  {
    icon: ShieldCheck,
    title: "Team roles & permissions",
    body: "Owner, admin, agent, and viewer roles with read-only and per-feature access controls.",
  },
  {
    icon: KeyRound,
    title: "REST API & webhooks",
    body: "A public API for contacts, conversations, and messages plus webhook delivery for your own integrations.",
  },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "Is there a free trial?",
    a: `Yes — every new account starts with a ${branding.trialDays}-day free trial. No payment method is required to start.`,
  },
  {
    q: "What happens when my trial or subscription ends?",
    a: "Your data is never deleted. The workspace becomes read-only, and you can reactivate at any time to pick up where you left off.",
  },
  {
    q: "Do I need a WhatsApp Business API account?",
    a: `Yes. ${branding.name} connects to the official WhatsApp Business Platform, so you need a WhatsApp Business number approved by Meta. The onboarding wizard walks you through connecting it.`,
  },
  {
    q: "Is this a rule about Meta's 24-hour window?",
    a: "WhatsApp only lets you message customers freely within a 24-hour customer service window after their last reply. Our inbox surfaces the session timer and template broadcasts let you re-engage after it expires.",
  },
  {
    q: "Can I self-host or white-label it?",
    a: `Yes — the product is self-hostable and the public-facing name, support email, and brand color are set from environment variables. Reach us at ${branding.supportEmail} with any questions.`,
  },
];

const planPreview: {
  name: string;
  price: string;
  blurb: string;
  highlight: boolean;
}[] = [
  {
    name: "Starter",
    price: "₹999",
    blurb: "Up to 2 agents · 1,000 contacts",
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹2,499",
    blurb: "Up to 5 agents · 5,000 contacts",
    highlight: true,
  },
  {
    name: "Pro",
    price: "₹4,999",
    blurb: "Up to 15 agents · 25,000 contacts",
    highlight: false,
  },
  {
    name: "Agency",
    price: "₹9,999",
    blurb: "Up to 50 agents · 100,000 contacts",
    highlight: false,
  },
];

function CtaRow() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Link
        href="/signup"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        Start your free trial <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="text-sm text-muted-foreground">
        No credit card required ·{" "}
        <Link
          href="/pricing"
          className="font-medium text-primary hover:underline"
        >
          Compare plans
        </Link>
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16 pb-16 pt-6 sm:gap-20 sm:pt-10 lg:gap-24">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="marketing-container">
          <div className="mx-auto max-w-3xl text-center sm:mx-0 sm:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              Built on the official WhatsApp Business Platform
            </p>
            <h1 className="mt-6 text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[1.08] tracking-tight text-balance sm:mt-8">
              The WhatsApp-first CRM for sales teams
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:mx-0 sm:text-lg lg:text-xl">
              Every conversation, contact, deal, and broadcast — in one
              shared inbox. Connect your WhatsApp number, and your whole
              team sells better.
            </p>
            <div className="mt-8 flex justify-center sm:justify-start">
              <CtaRow />
            </div>
          </div>
        </div>
      </section>

      {/* Feature flags strip */}
      <section className="marketing-container">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            "Inbox with session timers",
            "Template broadcasts",
            "Automations & flows",
            "AI reply assistant",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-lg border border-border glass-card px-4 py-3 text-sm font-medium"
            >
              <Check className="h-4 w-4 shrink-0 text-primary" />
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="marketing-container">
        <SectionHeading
          eyebrow="Features"
          title="Everything a WhatsApp-enabled sales team needs"
          subtitle="From a shared inbox to AI-assisted replies — built to ship revenue conversations from a single number."
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title}>
              {f.body}
            </FeatureCard>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="marketing-container">
        <SectionHeading
          eyebrow="How it works"
          title="Live in minutes"
          subtitle="No developer required. If you can send a WhatsApp message, you can run this CRM."
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              icon: UsersRound,
              step: "1",
              title: "Connect your WhatsApp number",
              body: "Add your WhatsApp Business number and start with a guided setup that checks the connection for you.",
            },
            {
              icon: Inbox,
              step: "2",
              title: "Import contacts & start chatting",
              body: "Import a CSV of contacts, assign conversations, and reply from a shared inbox with your team.",
            },
            {
              icon: Workflow,
              step: "3",
              title: "Automate & scale",
              body: "Broadcast templates, build automation rules, and let AI draft replies for the messages you can't get to.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="relative rounded-xl border border-border glass-card p-6"
            >
              <span className="absolute right-6 top-6 text-4xl font-bold text-primary/10">
                {s.step}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section id="pricing" className="marketing-container">
        <SectionHeading
          eyebrow="Pricing"
          title="Plans that grow with your team"
          subtitle={`Start with a ${branding.trialDays}-day free trial on every plan.`}
        />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {planPreview.map((p) => (
            <div
              key={p.name}
              className={
                p.highlight
                  ? "relative rounded-xl border-2 border-primary glass-card p-6"
                  : "rounded-xl border border-border glass-card p-6"
              }
            >
              {p.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="mt-3 text-2xl font-bold">
                {p.price}
                <span className="text-sm font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{p.blurb}</p>
              <Link
                href="/pricing"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-10 divide-y divide-border rounded-xl border border-border glass-card">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group px-5 py-4 open:bg-muted/30"
            >
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

      {/* Final CTA */}
      <section className="marketing-container">
        <div className="rounded-2xl border border-border glass-card px-6 py-12 text-center sm:px-8 sm:py-16">
          <h2 className="mx-auto max-w-xl text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            Put your sales conversations on WhatsApp
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Set up in minutes. Connect your WhatsApp number and start
            selling from one shared inbox.
          </p>
          <div className="mt-8">
            <CtaRow />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Questions?{" "}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {branding.supportEmail}
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}