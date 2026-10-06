import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orderLateFees, orderToteAssignments, orders, totes } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { OrderDetailClient } from "../order-detail-client";
import { PriceOverrideForm } from "../price-override-form";
import { LateFeesSection } from "../late-fees-section";
import { updateOrderNotesAction } from "../actions";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

function fmtAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "--";
  const a = value as Record<string, string>;
  return [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const orderRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = orderRows[0];
  if (!order) notFound();

  const assignmentRows = await db
    .select({ id: orderToteAssignments.id, toteId: orderToteAssignments.toteId, toteNumber: totes.number })
    .from(orderToteAssignments)
    .innerJoin(totes, eq(orderToteAssignments.toteId, totes.id))
    .where(and(eq(orderToteAssignments.orderId, order.id), isNull(orderToteAssignments.releasedAt)));

  const readyTotes = await db
    .select({ id: totes.id, number: totes.number })
    .from(totes)
    .where(eq(totes.status, "ready"))
    .orderBy(asc(totes.number));

  const lateFeeRows = await db
    .select()
    .from(orderLateFees)
    .where(eq(orderLateFees.orderId, order.id))
    .orderBy(desc(orderLateFees.createdAt));

  const addOns = Array.isArray(order.addOns)
    ? (order.addOns as Array<{ name: string; priceCents: number; quantity: number }>)
    : [];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/orders" className="text-sm text-[var(--color-muted)] hover:underline">
        ← Orders
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
        Order {order.orderNumber}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Status: <span className="font-medium">{order.status.replace(/_/g, " ")}</span> · Payment:{" "}
        <span className="font-medium">{order.paymentStatus.replace(/_/g, " ")}</span>
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <h2 className="mb-2 font-medium text-[var(--color-text)]">Customer</h2>
          <p>{order.customerName}</p>
          <p>{order.customerEmail}</p>
          <p>{order.customerPhone}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <h2 className="mb-2 font-medium text-[var(--color-text)]">Dates</h2>
          <p>Delivery: {order.confirmedDeliveryDate}</p>
          <p>Pickup: {order.confirmedPickupDate}</p>
          {order.actualDeliveredAt && (
            <p className="text-[var(--color-muted)]">
              Delivered: {new Date(order.actualDeliveredAt).toLocaleString()}
            </p>
          )}
          {order.actualPickedUpAt && (
            <p className="text-[var(--color-muted)]">
              Picked up: {new Date(order.actualPickedUpAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <h2 className="mb-2 font-medium text-[var(--color-text)]">Delivery address</h2>
          <p>{fmtAddress(order.deliveryAddress)}</p>
          {order.deliveryInstructions && (
            <p className="mt-1 text-[var(--color-muted)]">{order.deliveryInstructions}</p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <h2 className="mb-2 font-medium text-[var(--color-text)]">Pickup address</h2>
          <p>
            {order.pickupSameAsDelivery ? "Same as delivery" : fmtAddress(order.pickupAddress)}
          </p>
          {order.pickupInstructions && (
            <p className="mt-1 text-[var(--color-muted)]">{order.pickupInstructions}</p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <h2 className="mb-2 font-medium text-[var(--color-text)]">Order details</h2>
        <p>
          {order.packageName} -- {order.packageToteQuantity} totes,{" "}
          {order.rentalDurationWeeks + order.extensionWeeks} weeks
          {order.extensionWeeks > 0 ? ` (${order.extensionWeeks} extra)` : ""}
          {order.includesDolly ? ", includes dolly" : ""}
        </p>
        {addOns.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-[var(--color-muted)]">
            {addOns.map((a, i) => (
              <li key={i}>
                {a.name} × {a.quantity} (${centsToDollarsString(a.priceCents)} each)
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3">
          <p>Package price: ${centsToDollarsString(order.packagePriceCents)}</p>
          <p>Delivery fee: ${centsToDollarsString(order.deliveryFeeCents)}</p>
          <p>Pickup fee: ${centsToDollarsString(order.pickupFeeCents)}</p>
          {order.priceOverrideCents !== null && (
            <p className="text-[var(--color-accent)]">
              Manual override applied: ${centsToDollarsString(order.priceOverrideCents)}
            </p>
          )}
          <p className="font-medium text-[var(--color-text)]">
            Total: ${centsToDollarsString(order.finalAmountCents)} {order.currency}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 font-medium text-[var(--color-text)]">Manage order</h2>
        <OrderDetailClient
          orderId={order.id}
          status={order.status}
          packageToteQuantity={order.packageToteQuantity}
          assignments={assignmentRows}
          readyTotes={readyTotes}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 font-medium text-[var(--color-text)]">Manual price override</h2>
        <PriceOverrideForm
          orderId={order.id}
          currentOverride={
            order.priceOverrideCents !== null ? centsToDollarsString(order.priceOverrideCents) : ""
          }
          currentReason={order.priceOverrideReason ?? ""}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 font-medium text-[var(--color-text)]">Late fees</h2>
        <LateFeesSection
          orderId={order.id}
          fees={lateFeeRows.map((f) => ({
            id: f.id,
            amountCents: f.amountCents,
            reason: f.reason,
            status: f.status,
            chargeFailureMessage: f.chargeFailureMessage,
            createdAt: f.createdAt.toISOString(),
          }))}
          hasCardOnFile={Boolean(order.stripeCustomerId && order.stripePaymentMethodId)}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 font-medium text-[var(--color-text)]">Internal notes</h2>
        <form action={updateOrderNotesAction.bind(null, order.id)} className="space-y-3">
          <Field label="Notes (not visible to the customer)" htmlFor="internalNotes">
            <textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              defaultValue={order.internalNotes ?? ""}
              className={inputClass}
            />
          </Field>
          <SubmitButton>Save notes</SubmitButton>
        </form>
      </section>

      {order.agreementSignatureDataUrl && (
        <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 font-medium text-[var(--color-text)]">
            Signed agreement ({order.agreementVersionLabel})
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.agreementSignatureDataUrl}
            alt="Customer signature"
            className="h-32 rounded border border-[var(--color-border)] bg-white"
          />
        </section>
      )}
    </div>
  );
}
