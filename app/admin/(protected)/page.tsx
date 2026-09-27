import Link from "next/link";

const QUICK_LINKS = [
  { href: "/admin/packages", label: "Manage Packages" },
  { href: "/admin/add-ons", label: "Manage Add-Ons" },
  { href: "/admin/faqs", label: "Manage FAQs" },
  { href: "/admin/settings", label: "Business Settings" },
];

export default function AdminDashboardPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Dashboard</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Orders, the calendar, and daily operations will appear here as those parts of
        ToteMate are built in later phases. For now, set up your packages, add-ons, and
        FAQs so the public site has something real to show.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
