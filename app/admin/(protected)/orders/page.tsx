import Link from "next/link";
import { desc, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";

/** Cancelled/refunded orders are never deleted (full history is kept
 * deliberately -- see adminCancelOrderAction), but they'd otherwise clutter
 * the default list with dead rows, including old pre-existing test/clutter
 * orders the owner wants cleaned up. Hidden by default; ?showCancelled=1
 * brings them back. */
const HIDDEN_BY_DEFAULT_STATUSES = ["cancelled", "refunded"];

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

/**
 * Order numbers are "TM-YYYYMMDD-NNNNNN" -- useful in full on the order
 * detail page and in emails, but too wide for a table column. The trailing
 * 6-digit random segment is what's actually distinct between orders placed
 * the same day, so that's what's shown here; the full number is still in
 * the link's title attribute (hover) and on the detail page itself.
 */
function shortOrderNumber(orderNumber: string): string {
  const parts = orderNumber.split("-");
  return parts.length === 3 ? `#${parts[2]}` : orderNumber;
}

function formatPlacedAt(createdAt: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(createdAt);
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ showCancelled?: string }>;
}) {
  const { showCancelled } = await searchParams;
  const includeCancelled = showCancelled === "1";

  const db = getDb();
  const rows = includeCancelled
    ? await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200)
    : await db
        .select()
        .from(orders)
        .where(notInArray(orders.status, HIDDEN_BY_DEFAULT_STATUSES))
        .orderBy(desc(orders.createdAt))
        .limit(200);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Orders</h1>
        <div className="flex items-center gap-4">
          <Link
            href={includeCancelled ? "/admin/orders" : "/admin/orders?showCancelled=1"}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            {includeCancelled ? "Hide cancelled/refunded" : "Show cancelled/refunded"}
          </Link>
          <Link
            href="/admin/orders/new"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            + New Order
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Most recent 200 orders. Only paid/confirmed bookings appear here -- a checkout that's
        abandoned before payment never shows up.
        {!includeCancelled && " Cancelled and refunded orders are hidden by default."}
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">No orders yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Placed</th>
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
                      title={order.orderNumber}
                      className="font-medium text-[var(--color-text)] hover:underline"
                    >
                      {shortOrderNumber(order.orderNumber)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-muted)]">
                    {formatPlacedAt(order.createdAt)}
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
