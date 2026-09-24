"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/**
 * Mobile-only header navigation for the marketing site. Desktop keeps
 * the inline nav (hidden via `lg:hidden` on this component); on phones
 * and tablets this renders a hamburger that toggles a frosted dropdown
 * with the nav links and auth CTAs. Locks body scroll + Escape-to-close
 * while open, mirroring the dashboard drawer.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          {/* Backdrop — closes the menu on tap outside. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
          />
          <div
            role="menu"
            className="glass-card absolute right-0 top-12 z-50 w-56 p-2"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 border-t border-border" />
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center justify-center rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90",
              )}
            >
              Start free trial
            </Link>
            <Link
              href="/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-md px-3 py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Log in
            </Link>
          </div>
        </>
      )}
    </div>
  );
}