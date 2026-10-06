import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { getSessionAdmin } from "@/lib/auth/session";
import { buildPublicThemeStyle } from "@/lib/theme";
import { logoutAction } from "@/lib/auth/actions";

// Queries the session cookie + database on every request, same reasoning
// as app/admin/(protected)/layout.tsx.
export const dynamic = "force-dynamic";

export default async function DriverLayout({ children }: { children: ReactNode }) {
  // Deliberately not requireStaff() here: that helper redirects to
  // /admin/login, which is the right target when it's called from inside
  // an /admin action, but a driver landing on /driver with no session
  // should go to /driver/login instead -- same shared accounts table,
  // different front door.
  const staff = await getSessionAdmin();
  if (!staff) {
    redirect("/driver/login");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const themeStyle = buildPublicThemeStyle(rows[0]);

  return (
    <div style={themeStyle} className="min-h-screen bg-[var(--color-background)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6">
        <div>
          <span className="font-serif text-lg font-semibold text-[var(--color-text)]">
            ToteMate Driver
          </span>
          <p className="text-xs text-[var(--color-muted)]">Signed in as {staff.name}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)]"
          >
            Log out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
