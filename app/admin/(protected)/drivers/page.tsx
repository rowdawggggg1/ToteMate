import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DriversListPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(admins)
    .where(eq(admins.role, "driver"))
    .orderBy(asc(admins.name));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Drivers</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Driver accounts sign in at /driver and see every scheduled delivery/pickup.
          </p>
        </div>
        <Link
          href="/admin/drivers/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Driver
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No driver accounts yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((driver) => (
            <li key={driver.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/drivers/${driver.id}`}
                  className="font-medium text-[var(--color-text)] hover:underline"
                >
                  {driver.name}
                </Link>
                <p className="text-sm text-[var(--color-muted)]">{driver.email}</p>
                {driver.lastLoginAt && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Last signed in {new Date(driver.lastLoginAt).toLocaleString()}
                  </p>
                )}
              </div>
              <span
                className={
                  driver.isActive
                    ? "shrink-0 rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                    : "shrink-0 rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                }
              >
                {driver.isActive ? "Active" : "Deactivated"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
