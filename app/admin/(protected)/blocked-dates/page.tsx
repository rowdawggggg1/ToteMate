import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blockedDates } from "@/lib/db/schema";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { AddBlockedDateForm } from "./add-blocked-date-form";
import { deleteBlockedDateAction } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(dateStr: string): string {
  // Render as a plain calendar date, not a localized Date object, so it
  // never shifts a day due to timezone conversion.
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

export default async function BlockedDatesPage() {
  const db = getDb();
  const rows = await db.select().from(blockedDates).orderBy(asc(blockedDates.date));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Blocked Dates</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Dates here are unavailable for new delivery or pickup selections on the public
          booking site, regardless of capacity or inventory.
        </p>
      </div>

      <div className="mt-6">
        <AddBlockedDateForm />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No dates are currently blocked.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text)]">{formatDate(row.date)}</p>
                {row.reason && (
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{row.reason}</p>
                )}
              </div>
              <form action={deleteBlockedDateAction.bind(null, row.id)}>
                <ConfirmSubmitButton
                  confirmMessage="Unblock this date?"
                  className="shrink-0 text-xs font-medium text-[var(--color-error)] hover:underline"
                >
                  Unblock
                </ConfirmSubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
