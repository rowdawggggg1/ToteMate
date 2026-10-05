import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { totes } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  with_customer: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  needs_cleaning: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
  damaged: "bg-[var(--color-error)]/15 text-[var(--color-error)]",
  lost: "bg-[var(--color-error)]/15 text-[var(--color-error)]",
  retired: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  with_customer: "With customer",
  needs_cleaning: "Needs cleaning",
  damaged: "Damaged",
  lost: "Lost",
  retired: "Retired",
};

export default async function InventoryPage() {
  const db = getDb();
  const rows = await db.select().from(totes).orderBy(asc(totes.number));

  const activeFleetSize = rows.filter((t) => t.status !== "retired" && t.status !== "lost").length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {activeFleetSize} active {activeFleetSize === 1 ? "tote" : "totes"} in the fleet.
          </p>
        </div>
        <Link
          href="/admin/inventory/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Add Tote
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No totes yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Completed rentals</th>
                <th className="px-4 py-3 font-medium">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tote) => (
                <tr key={tote.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/${tote.id}`}
                      className="font-medium text-[var(--color-text)] hover:underline"
                    >
                      {tote.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[tote.status] ?? ""
                      }`}
                    >
                      {STATUS_LABELS[tote.status] ?? tote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{tote.completedRentalCount}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    ${centsToDollarsString(tote.netProfitAttributedCents)}
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
