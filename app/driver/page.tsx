import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { DriverJobsClient } from "./driver-jobs-client";

export const dynamic = "force-dynamic";

function fmtAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "--";
  const a = value as Record<string, string>;
  return [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
}

export default async function DriverJobsPage() {
  const db = getDb();

  // Every driver sees every job -- no per-order assignment, per the
  // owner's choice (simplest for a small driver team). Deliveries are
  // "scheduled" orders (not yet delivered); pickups are "delivered"
  // orders (out with the customer, due back).
  const [deliveries, pickups] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(eq(orders.status, "scheduled"))
      .orderBy(asc(orders.confirmedDeliveryDate)),
    db
      .select()
      .from(orders)
      .where(eq(orders.status, "delivered"))
      .orderBy(asc(orders.confirmedPickupDate)),
  ]);

  const deliveryJobs = deliveries.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    date: o.confirmedDeliveryDate,
    window: o.preferredDeliveryWindow,
    address: fmtAddress(o.deliveryAddress),
    instructions: o.deliveryInstructions,
    packageSummary: `${o.packageName} -- ${o.packageToteQuantity} totes`,
  }));

  const pickupJobs = pickups.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    date: o.confirmedPickupDate,
    window: o.preferredPickupWindow,
    address: o.pickupSameAsDelivery ? fmtAddress(o.deliveryAddress) : fmtAddress(o.pickupAddress),
    instructions: o.pickupSameAsDelivery ? o.deliveryInstructions : o.pickupInstructions,
    packageSummary: `${o.packageName} -- ${o.packageToteQuantity} totes`,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Today's Jobs</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Every scheduled delivery and pickup, for every driver.
      </p>
      <DriverJobsClient deliveries={deliveryJobs} pickups={pickupJobs} />
    </div>
  );
}
