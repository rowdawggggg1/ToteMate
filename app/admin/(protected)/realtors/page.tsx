import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { admins } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function RealtorsListPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(admins)
    .where(eq(admins.role, "realtor"))
    .orderBy(asc(admins.name));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Realtors</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Realtor accounts sign in at /realtor to see their referral code, manage a
            subscription, and buy gift cards.
          </p>
        </div>
        <Link
          href="/admin/realtors/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          New Realtor
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No realtor accounts yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((realtor) => (
            <li key={realtor.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/realtors/${realtor.id}`}
                  className="font-medium text-[var(--color-text)] hover:underline"
                >
                  {realtor.name}
                </Link>
                <p className="text-sm text-[var(--color-muted)]">{realtor.email}</p>
                {realtor.lastLoginAt && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Last signed in {new Date(realtor.lastLoginAt).toLocaleString()}
                  </p>
                )}
              </div>
              <span
                className={
                  realtor.isActive
                    ? "shrink-0 rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                    : "shrink-0 rounded-full bg-[var(--color-muted)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]"
                }
              >
                {realtor.isActive ? "Active" : "Deactivated"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
