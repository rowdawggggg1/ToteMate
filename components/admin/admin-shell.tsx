"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--color-background)] md:flex">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
        <span className="font-serif text-lg font-semibold text-[var(--color-text)]">
          ToteMate
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-[var(--color-border)] p-2"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-72 flex-col bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-serif text-lg font-semibold text-[var(--color-text)]">
                ToteMate
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg border border-[var(--color-border)] p-2"
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter adminEmail={adminEmail} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:flex">
        <div className="mb-8">
          <p className="font-serif text-xl font-semibold text-[var(--color-text)]">
            ToteMate
          </p>
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Admin
          </p>
        </div>
        <SidebarNav pathname={pathname} />
        <SidebarFooter adminEmail={adminEmail} />
      </aside>

      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text)] hover:bg-[var(--color-background)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ adminEmail }: { adminEmail: string }) {
  return (
    <div className="mt-6 border-t border-[var(--color-border)] pt-4 text-sm">
      <p className="truncate text-[var(--color-muted)]">Signed in as</p>
      <p className="mb-3 truncate font-medium text-[var(--color-text)]">{adminEmail}</p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-sm font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </form>
    </div>
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
