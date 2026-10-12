import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, packages } from "@/lib/db/schema";
import { NewOrderForm, type PackageOption } from "./new-order-form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const db = getDb();
  const packageRows = await db.select().from(packages).where(eq(packages.isActive, true));
  const addOnRows = await db.select().from(addOns).where(eq(addOns.isWeeklyExtension, true));

  const packageOptions: PackageOption[] = packageRows.map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    toteQuantity: p.toteQuantity,
    rentalDurationWeeks: p.rentalDurationWeeks,
    hasWeeklyExtension: addOnRows.some((a) => a.packageId === p.id),
  }));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/orders" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Orders
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Create Custom Order</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        For phone, email, or walk-in bookings you process yourself. Skips online-booking rules
        (minimum lead time, address geocoding) that don&apos;t apply when you&apos;re handling it directly --
        inventory and scheduling conflicts are still checked.
      </p>

      {packageOptions.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          No active packages yet -- add one in Packages first.
        </p>
      ) : (
        <div className="mt-6">
          <NewOrderForm packages={packageOptions} />
        </div>
      )}
    </div>
  );
}
