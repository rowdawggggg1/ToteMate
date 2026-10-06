"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#packages", label: "Packages" },
  { href: "/#faq", label: "FAQ" },
  { href: "/realtors", label: "Realtors" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader({
  businessName,
  logoUrl,
}: {
  businessName: string;
  logoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold text-[var(--color-text)]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-provided external URL, not a known static asset
            // Logo image is assumed to be a full lockup (icon + business name
            // already baked into the artwork), so it's shown alone -- no
            // separate text duplicating the name beside it. Sized taller
            // than the old 36px so a lockup with a wordmark + tagline stays
            // legible, while still fitting the header on mobile.
            <img
              src={logoUrl}
              alt={businessName}
              className="h-12 w-auto max-w-[220px] object-contain sm:h-14 sm:max-w-none"
            />
          ) : (
            businessName
          )}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/book"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Book Now
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-lg border border-[var(--color-border)] p-2 md:hidden"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-[var(--color-text)]"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-center text-sm font-medium text-white"
            >
              Book Now
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
