"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading, account, isOwner } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Accounts that haven't finished onboarding get pushed through the
  // wizard. Only the OWNER completes the wizard (business info + plan);
  // other members (agents/admins) are not redirected — they were invited
  // into an existing, already-onboarded workspace.
  useEffect(() => {
    if (
      user &&
      isOwner &&
      !profileLoading &&
      account &&
      account.onboarding_completed === false
    ) {
      const path = window.location.pathname;
      // The wizard links out to real pages (/settings, /pipelines, /inbox)
      // to complete each step — don't redirect those away. Everything else
      // (dashboard, broadcasts, automations, …) funnels to the wizard.
      const allowed = ["/settings", "/pipelines", "/inbox", "/contacts", "/onboarding"];
      if (!allowed.some((p) => path.startsWith(p))) {
        router.replace("/onboarding");
      }
    }
  }, [user, isOwner, profileLoading, account, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {/* Ambient colour blobs for the frosted-glass panels. They sit
          behind the whole shell so EVERY page gets the glassy
          atmosphere — the sidebar, header and card panes blur them
          through their backdrop-filter. */}
      <div
        aria-hidden="true"
        className="glass-orb -top-24 -left-24 h-80 w-80 bg-primary/15"
      />
      <div
        aria-hidden="true"
        className="glass-orb right-[-10rem] top-1/3 h-96 w-96 bg-cyan-400/10"
      />
      <div
        aria-hidden="true"
        className="glass-orb bottom-[-8rem] left-1/4 h-80 w-96 bg-rose-400/10"
      />

      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to
            breathe. Centred content cap keeps data-heavy pages readable
            on very wide monitors instead of stretching edge-to-edge;
            `max-w-[1400px]` stays wide enough for the inbox/pipelines
            workspace views to feel full-bleed. */}
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
