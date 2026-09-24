"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const MASKED_TOKEN = "••••••••••••••••";

type ConnectState =
  | "checking"
  | "connected"
  | "connected_unregistered"
  | "form"
  | "saving";

interface HealthPayload {
  connected?: boolean;
  reason?: string;
  message?: string;
  needs_reset?: boolean;
  phone_info?: { verified_name?: string; display_phone_number?: string };
}

interface SavePayload {
  success?: boolean;
  saved?: boolean;
  registered?: boolean;
  registration_skipped?: boolean;
  registration_error?: string | null;
  phone_info?: { verified_name?: string; display_phone_number?: string };
}

// ============================================================
// Guided WhatsApp connect for onboarding step 3. Replaces the old
// "link out to /settings" card with an embedded, minimal version of
// the full settings flow — same POST /api/whatsapp/config endpoint
// (Meta verification + server-side token encryption + Phase 7 plan
// cap), and the same GET health check. Users who hit the plan's
// whatsapp_numbers cap will see the 403 message inline.
//
// Strings are hardcoded English to match the rest of the onboarding
// wizard, which predates next-intl and is untranslated.
// ============================================================
export function WhatsAppConnectGuide({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const supabase = createClient();
  const { accountId, profileLoading, canEditSettings } = useAuth();

  const [state, setState] = useState<ConnectState>("checking");
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [pin, setPin] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenEdited, setTokenEdited] = useState(false);

  const checkedAccountRef = useRef<string | null>(null);

  const checkConnection = useCallback(
    async (acctId: string | null) => {
      if (!acctId) return;
      // Every state write below happens AFTER the first await, so the
      // wizard never cascades a render from inside the effect that
      // kicked this off — `state` starts at "checking".
      const { data } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("account_id", acctId)
        .maybeSingle();

      if (!data) {
        setState("form");
        setConnectedName(null);
        return;
      }

      const res = await fetch("/api/whatsapp/config", { method: "GET" });
      const payload = (await res.json()) as HealthPayload;

      if (payload.connected) {
        setConnectedName(
          payload.phone_info?.verified_name ??
            payload.phone_info?.display_phone_number ??
            null,
        );
        setState("connected");
      } else {
        setConnectedName(
          payload.phone_info?.verified_name ??
            payload.phone_info?.display_phone_number ??
            null,
        );
        setStatusMessage(payload.message || "");
        setState("connected_unregistered");
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (profileLoading) return;
    if (!accountId) return;
    if (checkedAccountRef.current === accountId) return;
    checkedAccountRef.current = accountId;
    // Defer to a macrotask so the connection probe's state writes
    // never run in the effect's own frame (avoids a render cascade).
    const timer = setTimeout(() => {
      void checkConnection(accountId);
    }, 0);
    return () => clearTimeout(timer);
  }, [profileLoading, accountId, checkConnection]);

  async function handleConnect() {
    if (!phoneNumberId.trim()) {
      toast.error("Phone Number ID is required");
      return;
    }
    if (!accessToken.trim() || !tokenEdited) {
      toast.error("Access Token is required for connecting");
      return;
    }

    setState("saving");
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim() || null,
          verify_token: verifyToken.trim() || null,
          pin: pin.trim() || null,
          access_token: accessToken.trim(),
        }),
      });

      const data = (await res.json()) as SavePayload;

      if (!res.ok) {
        // Phase 7: the whatsapp_numbers cap surfaces as a 403 with the
        // plan-limit message from the server.
        setState("form");
        toast.error(
          (data as { error?: string }).error ||
            "Failed to connect. Check the credentials and try again.",
        );
        return;
      }

      if (data.registration_error) {
        setConnectedName(
          data.phone_info?.verified_name ??
            data.phone_info?.display_phone_number ??
            null,
        );
        setStatusMessage(data.registration_error);
        setState("connected_unregistered");
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 10000 },
        );
      } else if (data.registration_skipped) {
        setConnectedName(
          data.phone_info?.verified_name ??
            data.phone_info?.display_phone_number ??
            null,
        );
        setStatusMessage(
          "Inbound registration was skipped (no PIN). You can add a PIN later in Settings.",
        );
        setState("connected_unregistered");
        toast.success("Credentials saved and verified with Meta.");
      } else {
        setConnectedName(
          data.phone_info?.verified_name ??
            data.phone_info?.display_phone_number ??
            null,
        );
        setState("connected");
        toast.success(
          data.phone_info?.verified_name
            ? `Connected — ${data.phone_info.verified_name} can now receive events.`
            : "WhatsApp connected. Events will start flowing within a minute.",
        );
      }
    } catch (err) {
      console.error("WhatsApp connect error:", err);
      setState("form");
      toast.error("Failed to connect. Check your network and try again.");
    }
  }

  function handleClear() {
    setPhoneNumberId("");
    setWabaId("");
    setAccessToken("");
    setVerifyToken("");
    setPin("");
    setTokenEdited(false);
    setState("form");
  }

  if (state === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Checking your WhatsApp connection…
        </p>
      </div>
    );
  }

  if (state === "connected") {
    return (
      <div className="flex flex-col gap-4">
        <Alert className="border-emerald-700/50 bg-emerald-950/30">
          <AlertTitle className="flex items-center gap-2 text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            WhatsApp is connected
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {connectedName
              ? `${connectedName} is linked to your workspace and can send and receive messages.`
              : "Your number is linked to the workspace and can send and receive messages."}
          </AlertDescription>
        </Alert>
        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onContinue}
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    );
  }

  if (state === "connected_unregistered") {
    return (
      <div className="flex flex-col gap-4">
        <Alert className="border-amber-700/50 bg-amber-950/30">
          <AlertTitle className="flex items-center gap-2 text-amber-200">
            <XCircle className="h-4 w-4 text-amber-400" />
            {connectedName
              ? `${connectedName} is connected, but not fully registered`
              : "Connected, but not fully registered"}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {statusMessage ||
              "The number was saved with Meta, but inbound events aren't wired up yet. You can finish registration with a 6-digit PIN from Settings → WhatsApp."}
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onContinue}
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full border-border" onClick={handleClear}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Re-enter credentials
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Paste your WhatsApp Business (Meta Cloud API) credentials to link
        this workspace to your number. Find them in Meta&apos;s App Dashboard
        below — you&apos;ll open that in a new tab.
      </p>

      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Phone Number ID</Label>
          <Input
            placeholder="e.g. 100234567890123"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Access Token</Label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              placeholder="EAAG…"
              value={accessToken}
              onChange={(e) => {
                setAccessToken(e.target.value);
                setTokenEdited(true);
              }}
              onFocus={() => {
                if (accessToken === MASKED_TOKEN) {
                  setAccessToken("");
                  setTokenEdited(true);
                }
              }}
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {accessToken === MASKED_TOKEN
              ? "Stored token — leave the field blank to keep it."
              : "A permanent or temporary token from the WhatsApp app with the whatsapp_business_messaging permission."}
          </p>
        </div>

        <details className="rounded border border-border glass-card px-3 py-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none text-foreground">
            Optional fields (WABA ID, verify token, PIN)
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">WABA ID</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Webhook verify token</Label>
              <Input
                placeholder="Your chosen secret for the webhook"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">
                6-digit PIN <span className="text-muted-foreground/70">(optional)</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="…"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground tracking-widest"
              />
            </div>
            <p className="text-xs leading-relaxed">
              The PIN (Meta Business Manager two-step verification) makes
              inbound events work. Test numbers don&apos;t need one. Provide it
              on first connect if you have it — you can add it any time later
              from Settings.
            </p>
          </div>
        </details>
      </div>

      <Button
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={state === "saving"}
        onClick={handleConnect}
      >
        {state === "saving" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting to Meta…
          </>
        ) : (
          <>
            Connect WhatsApp
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <Accordion className="w-full">
        <AccordionItem className="border-border">
          <AccordionTrigger className="text-sm text-muted-foreground">
            Where do I find these credentials?
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Go to the{" "}
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  Facebook App Dashboard
                </a>{" "}
                and open (or create) the app connected to your WhatsApp
                Business Account.
              </li>
              <li>
                On the app&apos;s dashboard, click{" "}
                <span className="text-foreground">WhatsApp → Configuration</span>.
              </li>
              <li>
                Copy the{" "}
                <span className="text-foreground">Phone number ID</span> and{" "}
                <span className="text-foreground">
                  Temporary access token
                </span>
                . Click <span className="text-foreground">Manage</span> to create a
                permanent token if you prefer.
              </li>
              <li>
                The WABA ID and webhook verify token are optional here — paste
                them once you need inbound messages or a custom webhook.
              </li>
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <a
        href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 self-start text-sm text-primary hover:text-primary/80"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Full Meta Cloud API setup guide
      </a>

      <Button
        variant="ghost"
        className="w-full text-muted-foreground hover:text-foreground"
        disabled={!canEditSettings}
        onClick={onSkip}
      >
        Skip for now
      </Button>
      {!canEditSettings && (
        <p className="text-center text-xs text-muted-foreground">
          Only admins can connect WhatsApp. Ask your workspace admin to
          complete this step.
        </p>
      )}
    </div>
  );
}