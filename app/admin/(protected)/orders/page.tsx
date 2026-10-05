import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
  payment_pending: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  payment_failed: "bg-[var(--color-error)]/15 text-[var(--color-error)]",
  paid: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  scheduled: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  delivered: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
  active_rental: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
  picked_up: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
  completed: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  cancelled: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
  refunded: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]",
};

export default async function OrdersPage() {
  const db = getDb();
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Orders</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Most recent 200 orders.</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No orders yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Delivery</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-[var(--color-text)] hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{order.customerName}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{order.packageName}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {order.confirmedDeliveryDate}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[order.status] ?? ""
                      }`}
                    >
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    ${centsToDollarsString(order.finalAmountCents)}
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
