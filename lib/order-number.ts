/**
 * Patch 5: sequential order numbers ("TM-1", "TM-2", ...) instead of a
 * random 6-digit suffix, so the owner can track/reference orders by small,
 * easy-to-say numbers.
 *
 * Both order-creation paths (the public booking flow in lib/orders.ts and
 * admin-created custom orders in lib/custom-orders.ts) call this same
 * function, sharing one counter (businessSettings.nextOrderNumber) so
 * numbers are never reused or duplicated between the two paths.
 *
 * Concurrency safety: this does a single atomic `UPDATE ... RETURNING`
 * against the one-row businessSettings table. Postgres takes a row lock
 * for the duration of the UPDATE, so if two orders are created at nearly
 * the same instant, the second one's UPDATE simply waits for the first to
 * commit -- they can never read-then-write the same starting value and
 * collide. No separate sequence/table is needed for this scale.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";

export async function allocateNextOrderNumber(): Promise<string> {
  const db = getDb();

  const rows = await db
    .update(businessSettings)
    .set({
      nextOrderNumber: sql`${businessSettings.nextOrderNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(businessSettings.id, 1))
    .returning({ nextOrderNumber: businessSettings.nextOrderNumber });

  const updated = rows[0]?.nextOrderNumber;
  if (typeof updated !== "number") {
    throw new Error(
      "Could not allocate an order number -- the business settings row is missing. Run setup first."
    );
  }

  // The row now holds the NEXT number to hand out; the one we just
  // claimed for this order is one less than that.
  const allocated = updated - 1;
  return `TM-${allocated}`;
}
