"use client";

import { AuthProvider } from "@/hooks/use-auth";

// Client shell for the onboarding route group. The wizard consumes
// useAuth() (current user, account, owner role) — without the provider
// it inherits the "no context" fallback (user: null) and bounces
// through /login indefinitely. Same pattern as the dashboard shell.
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}