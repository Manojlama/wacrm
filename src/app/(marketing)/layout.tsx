import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { branding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/marketing/mobile-nav";

export const metadata: Metadata = {
  title: {
    default: branding.name,
    template: `%s — ${branding.name}`,
  },
  description: `${branding.name} is a WhatsApp-first CRM for sales teams — unified inbox, template broadcasts, automations, and AI replies in one place.`,
  robots: {
    index: true,
    follow: true,
  },
};

const PRIMARY_OVERRIDE: CSSProperties | undefined = branding.primaryColor
  ? ({
      "--primary": `#${branding.primaryColor}`,
      "--ring": `#${branding.primaryColor}`,
    } as CSSProperties)
  : undefined;

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const footerLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
];

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <MessageSquare className="h-4 w-4" />
      </span>
      <span className="text-base font-semibold tracking-tight">
        {branding.name}
      </span>
    </Link>
  );
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={PRIMARY_OVERRIDE}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="marketing-container flex h-16 items-center justify-between">
          <BrandMark />
          {/* Desktop nav — hidden on phones + tablets in favour of the
              hamburger (shown from 1024px up). */}
          <nav className="hidden items-center gap-1 sm:gap-2 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {/* Desktop auth CTAs — mobile gets these inside the drawer. */}
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Start free trial
            </Link>
          </div>
          <MobileNav />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-muted/30">
        <div className="marketing-container py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm space-y-3">
              <BrandMark />
              <p className="text-sm text-muted-foreground">
                The WhatsApp-first CRM for sales teams. Inbox, broadcasts,
                automations, and AI — in one place.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div className="space-y-2">
                <p className="font-semibold">Product</p>
                {footerLinks.slice(0, 2).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-semibold">Company</p>
                {footerLinks.slice(2).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
                <a
                  href={`mailto:${branding.supportEmail}`}
                  className="block break-all text-muted-foreground transition-colors hover:text-foreground"
                >
                  {branding.supportEmail}
                </a>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "mt-10 border-t border-border pt-6 text-xs text-muted-foreground",
            )}
          >
            © {new Date().getFullYear()} {branding.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}