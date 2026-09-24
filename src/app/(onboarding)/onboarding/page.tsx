"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, ArrowLeft, Rocket } from "lucide-react";
import type { Plan } from "@/types/subscription";
import { WhatsAppConnectGuide } from "./whatsapp-connect";

const TOTAL_STEPS = 7;

const STEP_TITLES = [
  "Business information",
  "Choose your plan",
  "Connect WhatsApp",
  "Create your first pipeline",
  "Invite your team",
  "Send your first message",
  "All set!",
];

// ============================================================
// Step 1 — Business info
// ============================================================
function StepBusiness({
  onNext,
  defaultName,
}: {
  onNext: (name: string) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName ?? "");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="biz-name" className="text-muted-foreground">
          Business name
        </Label>
        <Input
          id="biz-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          className="mt-2 border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary"
        />
      </div>
      <Button
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={!name.trim()}
        onClick={() => onNext(name.trim())}
      >
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================
// Step 2 — Choose plan / trial
// ============================================================
function StepPlan({
  plans,
  onSelect,
  currentPlanId,
  hasSubscription,
}: {
  plans: Plan[];
  onSelect: (planId: string, planName: string) => Promise<boolean>;
  currentPlanId?: string | null;
  hasSubscription: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(
    plans.find((p) => p.id === currentPlanId)?.name ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (plan: Plan) => {
    if (loading) return;
    setError(null);
    setSelected(plan.name);
    setLoading(true);
    try {
      const ok = await onSelect(plan.id, plan.name);
      if (!ok) setError("Could not change plan. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {hasSubscription
          ? "Your current plan is preselected. Switch to a different plan to upgrade or downgrade."
          : "Start with a free trial on any plan. Upgrade or downgrade anytime."}
      </p>
      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isSelected = selected === plan.name;
          const showSwitch = !(hasSubscription && isCurrent);
          return (
            <button
              key={plan.id}
              type="button"
              disabled={loading}
              onClick={() => handleSelect(plan)}
              className={`flex flex-col items-start rounded-lg border p-4 text-left transition-colors ${
                isCurrent
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted"
              } ${loading && !isSelected ? "opacity-50" : ""}`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {plan.display_name}
                </span>
                {isCurrent && hasSubscription ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Your current plan
                  </span>
                ) : null}
              </span>
              <span className="mt-1 text-lg font-bold text-foreground">
                ₹{Math.round(plan.monthly_price / 100).toLocaleString("en-IN")}/mo
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {plan.max_contacts.toLocaleString()} contacts · {plan.max_agents} agents
              </span>
              <span className="mt-2 text-xs font-medium">
                {isCurrent && hasSubscription
                  ? isSelected
                    ? "Continue with your current plan"
                    : "Click to continue with your current plan"
                  : isSelected
                    ? loading
                      ? hasSubscription
                        ? "Switching plan…"
                        : "Starting free trial…"
                      : "Selected — click again to proceed"
                    : hasSubscription
                      ? "Switch to this plan"
                      : "Start free trial"}
              </span>
              {showSwitch && isSelected ? (
                <span className="mt-1 text-xs text-primary">
                  {hasSubscription ? "Your plan will change immediately." : "Free trial — no card required."}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Step 3–6 — Action-link cards (link out to the actual feature)
// ============================================================
function StepActionCard({
  title,
  description,
  actionLabel,
  actionHref,
  onSkip,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  onSkip: () => void;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border glass-card">
        <CardHeader>
          <CardTitle className="text-foreground">{title}</CardTitle>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full border-border"
            onClick={() => router.push(actionHref)}
          >
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={onSkip}
          >
            Skip for now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Step 7 — Done
// ============================================================
function StepDone({ onComplete }: { onComplete: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Rocket className="h-8 w-8 text-primary" />
      </div>
      <p className="text-center text-muted-foreground">
        Your workspace is ready. Head to your dashboard to start managing conversations.
      </p>
      <Button
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await onComplete();
        }}
      >
        Go to dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================
// Main wizard
// ============================================================
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);

  // Redirect to login if not signed in
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Load plans once
  useEffect(() => {
    if (user) {
      fetch("/api/onboarding")
        .then((r) => r.json())
        .then((d) => {
          if (d.plans) setPlans(d.plans as Plan[]);
          const name =
            typeof d.account?.name === "string" ? d.account.name.trim() : "";
          if (name) setBusinessName(name);
          if (d.account?.current_plan_id) setCurrentPlanId(d.account.current_plan_id);
          setHasSubscription(Boolean(d.account?.has_subscription));
          // Business info is already on file → don't re-ask for it.
          if (name) setStep(2);
          if (d.account?.onboarding_completed) {
            router.replace("/dashboard");
          }
        })
        .catch(() => {});
    }
  }, [user, router]);

  const currentPlanName = plans.find((p) => p.id === currentPlanId)?.name ?? null;

  const choosePlan = useCallback(
    async (planId: string, planName: string): Promise<boolean> => {
      try {
        if (planName === currentPlanName) {
          setStep(3);
          return true;
        }
        const res = hasSubscription
          ? await fetch("/api/billing/upgrade", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan_id: planId }),
            })
          : await fetch("/api/billing/trial", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan: planName }),
            });
        if (!res.ok) return false;
        setCurrentPlanId(planId);
        setHasSubscription(true);
        setStep(3);
        return true;
      } catch {
        return false;
      }
    },
    [currentPlanName, hasSubscription],
  );

  const handleBusinessNext = useCallback(async (name: string) => {
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setStep(2);
  }, []);

  const handleComplete = useCallback(async () => {
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.replace("/dashboard");
  }, [router]);

  const skip = useCallback(() => setStep((s) => s + 1), []);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i + 1 <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Step {step} of {TOTAL_STEPS}
        </p>
        <h1 className="mb-6 text-xl font-semibold text-foreground">
          {STEP_TITLES[step - 1]}
        </h1>

        {step === 1 && <StepBusiness defaultName={businessName} onNext={handleBusinessNext} />}

        {step === 2 && plans.length > 0 && (
          <StepPlan
            plans={plans}
            onSelect={choosePlan}
            currentPlanId={currentPlanId}
            hasSubscription={hasSubscription}
          />
        )}
        {step === 2 && plans.length === 0 && (
          <div className="text-sm text-muted-foreground">Loading plans…</div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <WhatsAppConnectGuide onContinue={skip} onSkip={skip} />
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              I&apos;d rather connect from the full Settings page
            </button>
          </div>
        )}

        {step === 4 && (
          <StepActionCard
            title="Create your first pipeline"
            description="Track deals and sales through customizable stages with a visual Kanban board."
            actionLabel="Open pipelines"
            actionHref="/pipelines"
            onSkip={skip}
          />
        )}

        {step === 5 && (
          <StepActionCard
            title="Invite your team"
            description="Add agents and admins to collaborate on conversations and manage the CRM together."
            actionLabel="Open team settings"
            actionHref="/settings"
            onSkip={skip}
          />
        )}

        {step === 6 && (
          <StepActionCard
            title="Send your first WhatsApp message"
            description="Open a conversation and send your first message to a contact through the CRM."
            actionLabel="Open inbox"
            actionHref="/inbox"
            onSkip={skip}
          />
        )}

        {step === 7 && <StepDone onComplete={handleComplete} />}

        {/* Back button */}
        {step > 1 && step < 7 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="mt-4 flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> Back
          </button>
        )}
      </div>
    </div>
  );
}