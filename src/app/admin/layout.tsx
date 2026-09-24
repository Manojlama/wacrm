import Link from "next/link";
import { BarChart3 } from "lucide-react";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Super-admin shell. Rendered only for users whose email is in
 * SUPER_ADMIN_EMAILS (middleware gate + the page itself re-checks via
 * requireSuperAdmin). Deliberately NOT the app shell — this is a
 * distinct, minimal platform view.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <header className="border-b border-border glass-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">Admin</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="font-medium text-primary">
              Overview
            </Link>
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground"
            >
              Back to app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}