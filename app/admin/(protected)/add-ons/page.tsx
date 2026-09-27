import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, packages } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteAddOnAction, toggleAddOnActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AddOnsListPage() {
  const db = getDb();
  const rows = await db
    .select({
      id: addOns.id,
      name: addOns.name,
      priceCents: addOns.priceCents,
      isActive: addOns.isActive,
      isWeeklyExtension: addOns.isWeeklyExtension,
      displayOrder: addOns.displayOrder,
      packageName: packages.name,
    })
    .from(addOns)
    .leftJoin(packages, eq(addOns.packageId, packages.id))
    .orderBy(asc(addOns.displayOrder), asc(addOns.name));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Add-Ons</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            General add-ons are offered with every package; package-specific ones
            (including weekly extensions) only appear with the package they're tied
            to.
          </p>
        </div>
        <Link
          href="/admin/add-ons/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Add-On
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          No add-ons yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Available with</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((addOn) => (
                <tr key={addOn.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/add-ons/${addOn.id}`}
                      className="font-medium text-[var(--color-text)] hover:underline"
                    >
                      {addOn.name}
                    </Link>
                    {addOn.isWeeklyExtension && (
                      <span className="ml-2 rounded-full bg-[var(--color-accent)]/20 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                        Weekly extension
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">${centsToDollarsString(addOn.priceCents)}</td>
                  <td className="px-4 py-3">{addOn.packageName ?? "General"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        addOn.isActive
                          ? "rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                          : "rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                      }
                    >
                      {addOn.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      <form action={toggleAddOnActiveAction.bind(null, addOn.id)}>
                        <button
                          type="submit"
                          className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                        >
                          {addOn.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={deleteAddOnAction.bind(null, addOn.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Delete "${addOn.name}"? This cannot be undone.`}
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
