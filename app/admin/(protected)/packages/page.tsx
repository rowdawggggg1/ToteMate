import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  deletePackageAction,
  toggleActiveAction,
  toggleFeaturedAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PackagesListPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(packages)
    .orderBy(asc(packages.displayOrder), asc(packages.name));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Packages</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Only active packages appear on the public site.
          </p>
        </div>
        <Link
          href="/admin/packages/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Package
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          No packages yet. Create your first one to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Totes</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pkg) => (
                <tr key={pkg.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/packages/${pkg.id}`}
                      className="font-medium text-[var(--color-text)] hover:underline"
                    >
                      {pkg.name}
                    </Link>
                    {pkg.isFeatured && (
                      <span className="ml-2 rounded-full bg-[var(--color-accent)]/20 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                        Most Popular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">${centsToDollarsString(pkg.priceCents)}</td>
                  <td className="px-4 py-3">{pkg.toteQuantity}</td>
                  <td className="px-4 py-3">
                    {pkg.rentalDurationWeeks} week{pkg.rentalDurationWeeks === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        pkg.isActive
                          ? "rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                          : "rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                      }
                    >
                      {pkg.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      <form action={toggleActiveAction.bind(null, pkg.id)}>
                        <button type="submit" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                          {pkg.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={toggleFeaturedAction.bind(null, pkg.id)}>
                        <button type="submit" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                          {pkg.isFeatured ? "Unfeature" : "Feature"}
                        </button>
                      </form>
                      <form action={deletePackageAction.bind(null, pkg.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Delete "${pkg.name}"? This cannot be undone.`}
                          className="text-xs font-medium text-[var(--color-error)] hover:underline"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
