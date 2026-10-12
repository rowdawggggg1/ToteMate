/**
 * Patch 4: admin-created custom/phone/walk-in orders.
 *
 * A separate, simpler path from the public booking flow in lib/orders.ts --
 * deliberately so. The public flow enforces things that make sense for a
 * self-serve customer typing in their own address (ORS geocoding + service
 * area validation, a minimum lead time, a signed rental agreement) but get
 * in the way of an owner processing a phone call or a walk-in on their own
 * judgment. This path:
 *  - lets the admin pick any existing active package (custom pricing /
 *    one-off items are out of scope for now -- the admin can still use the
 *    existing manual price override after the order is created)
 *  - skips geocoding entirely -- the admin types the delivery/pickup fee
 *    directly, exactly like the existing manual price override already
 *    lets them do after the fact
 *  - skips the minimum-lead-time rule, same reasoning as
 *    adminRescheduleOrderDate in lib/reschedule.ts (an owner's own
 *    judgment call), but still enforces blocked dates / daily capacity /
 *    tote inventory, since those protect against a genuine double-booking
 *    regardless of who creates the order
 *  - doesn't require a signed rental agreement -- an admin-created order's
 *    internal notes should say how liability was handled for that
 *    particular booking (verbally, a paper form, etc.)
 *
 * Unlike the public flow's staged-booking pattern (pendingBookings), this
 * writes the real `orders` row immediately regardless of payment method --
 * there's no "abandoned checkout" risk here, since the admin explicitly
 * chose to create this order, and having it show up in the Orders list
 * right away (as "payment_pending" if Stripe payment is still owed) is
 * actually useful for tracking.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, orders, packages } from "@/lib/db/schema";
import {
  addWeeksToDateString,
  checkDailyCapacity,
  checkToteAvailability,
  getBusinessSettings,
  isDateBlocked,
} from "@/lib/availability";
import { resolveFinalAmountCents } from "@/lib/pricing";
import { generateManageToken, hashManageToken } from "@/lib/manage-token";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/email";

export type CustomOrderAddress = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

function formatAddress(a: CustomOrderAddress): string {
  return [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
}

export type CreateCustomOrderInput = {
  packageId: string;
  extensionWeeks: number;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  requestedDeliveryDate: string; // YYYY-MM-DD

  deliveryAddress: CustomOrderAddress;
  deliveryInstructions?: string;
  pickupSameAsDelivery: boolean;
  pickupAddress?: CustomOrderAddress;
  pickupInstructions?: string;

  // Entered directly by the admin -- no routing/distance calculation for a
  // custom order (see file-level comment).
  deliveryFeeCents: number;
  pickupFeeCents: number;

  // Optional manual override of the whole total, exactly like the existing
  // post-creation price override -- just settable up front here too.
  priceOverrideCents?: number | null;
  priceOverrideReason?: string | null;

  internalNotes?: string;

  paymentMethod: "mark_paid" | "charge_stripe";
};

function generateOrderNumber(): string {
  const datePart = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" })
    .format(new Date())
    .replace(/-/g, "");
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `TM-${datePart}-${randomPart}`;
}

export type CreateCustomOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      requiresPayment: boolean;
      // Only set when paymentMethod is "charge_stripe" -- a link the admin
      // can send the customer (text, email, however they normally reach
      // them) to collect payment. The order already exists in the Orders
      // list as "payment_pending" before this link is ever opened.
      checkoutUrl: string | null;
    }
  | { ok: false; error: string };

export async function createCustomOrder(
  input: CreateCustomOrderInput
): Promise<CreateCustomOrderResult> {
  const db = getDb();
  const settings = await getBusinessSettings();

  const packageRows = await db
    .select()
    .from(packages)
    .where(eq(packages.id, input.packageId))
    .limit(1);
  const pkg = packageRows[0];
  if (!pkg) return { ok: false, error: "That package no longer exists." };

  const availableAddOns = await db.select().from(addOns);
  const weeklyExtensionAddOn = availableAddOns.find(
    (a) => a.packageId === pkg.id && a.isWeeklyExtension
  );
  if (input.extensionWeeks > 0 && !weeklyExtensionAddOn) {
    return { ok: false, error: "This package doesn't offer a rental extension." };
  }

  if (await isDateBlocked(input.requestedDeliveryDate)) {
    return { ok: false, error: "That delivery date is unavailable. Please choose another date." };
  }

  const confirmedPickupDate = addWeeksToDateString(
    input.requestedDeliveryDate,
    pkg.rentalDurationWeeks + input.extensionWeeks
  );

  const deliveryCapacity = await checkDailyCapacity(input.requestedDeliveryDate);
  if (!deliveryCapacity.withinCapacity) {
    return { ok: false, error: "That delivery date is fully booked. Please choose another date." };
  }
  const pickupCapacity = await checkDailyCapacity(confirmedPickupDate);
  if (!pickupCapacity.withinCapacity) {
    return { ok: false, error: "That pickup date is fully booked. Please choose a different delivery date." };
  }

  const toteAvailability = await checkToteAvailability(
    input.requestedDeliveryDate,
    confirmedPickupDate,
    pkg.toteQuantity
  );
  if (!toteAvailability.available) {
    return { ok: false, error: "We don't have enough totes available for those dates." };
  }

  const extensionTotalCents =
    input.extensionWeeks > 0 && weeklyExtensionAddOn
      ? weeklyExtensionAddOn.priceCents * input.extensionWeeks
      : 0;

  const computedTotalCents =
    pkg.priceCents + extensionTotalCents + input.deliveryFeeCents + input.pickupFeeCents;
  const finalAmountCents = resolveFinalAmountCents(computedTotalCents, input.priceOverrideCents ?? null);
  if (finalAmountCents < 0) {
    return { ok: false, error: "The order total can't be negative." };
  }

  const manageToken = generateManageToken();
  const orderId = crypto.randomUUID();
  const orderNumber = generateOrderNumber();
  const requiresPayment = input.paymentMethod === "charge_stripe";

  const orderValues = {
    id: orderId,
    orderNumber,
    status: requiresPayment ? ("payment_pending" as const) : ("scheduled" as const),

    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,

    packageId: pkg.id,
    packageName: pkg.name,
    packageToteQuantity: pkg.toteQuantity,
    packagePriceCents: pkg.priceCents,
    rentalDurationWeeks: pkg.rentalDurationWeeks,
    includesDolly: pkg.includesDolly,

    weeklyExtensionAddOnId: weeklyExtensionAddOn?.id ?? null,
    weeklyExtensionName: weeklyExtensionAddOn?.name ?? null,
    weeklyExtensionPriceCents: weeklyExtensionAddOn?.priceCents ?? null,
    extensionWeeks: input.extensionWeeks,

    addOns: [],

    requestedDeliveryDate: input.requestedDeliveryDate,
    confirmedDeliveryDate: input.requestedDeliveryDate,
    requestedPickupDate: confirmedPickupDate,
    confirmedPickupDate: confirmedPickupDate,

    deliveryAddress: { ...input.deliveryAddress, formatted: formatAddress(input.deliveryAddress) },
    pickupSameAsDelivery: input.pickupSameAsDelivery,
    pickupAddress: input.pickupSameAsDelivery
      ? null
      : {
          ...(input.pickupAddress as CustomOrderAddress),
          formatted: formatAddress(input.pickupAddress as CustomOrderAddress),
        },
    deliveryInstructions: input.deliveryInstructions || null,
    pickupInstructions: input.pickupInstructions || null,

    deliveryFeeCents: input.deliveryFeeCents,
    pickupFeeCents: input.pickupFeeCents,
    priceOverrideCents: input.priceOverrideCents ?? null,
    priceOverrideReason: input.priceOverrideReason || null,

    finalAmountCents,
    currency: settings.currency,

    paymentStatus: requiresPayment ? ("pending" as const) : ("paid" as const),
    paidAt: requiresPayment ? null : new Date(),

    manageTokenHash: hashManageToken(manageToken),
    internalNotes: input.internalNotes || null,
  };

  await db.insert(orders).values(orderValues);

  if (!requiresPayment) {
    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows[0]) {
      await sendBookingConfirmationEmail(orderRows[0], manageToken).catch(() => {});
    }
    return { ok: true, orderId, orderNumber, requiresPayment: false, checkoutUrl: null };
  }

  // Payment owed via Stripe: generate a Checkout Session the admin can send
  // the customer. The order row already exists (as payment_pending) --
  // the webhook (checkout.session.completed, purpose "custom_order_payment")
  // just updates this same row to paid once Stripe confirms it, exactly
  // like any other admin update. setup_future_usage saves the card so a
  // late fee can be charged on-demand later, same as a normal booking.
  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.customerEmail,
      line_items: [
        {
          price_data: {
            currency: settings.currency.toLowerCase(),
            unit_amount: finalAmountCents,
            product_data: {
              name: `${pkg.name} -- order ${orderNumber}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: { setup_future_usage: "off_session" },
      metadata: { purpose: "custom_order_payment", orderId, orderNumber, manageToken },
      success_url: `${baseUrl}/admin/orders/${orderId}?paid=1`,
      cancel_url: `${baseUrl}/admin/orders/${orderId}`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout URL.");

    return { ok: true, orderId, orderNumber, requiresPayment: true, checkoutUrl: session.url };
  } catch (err) {
    // The order row stays as payment_pending either way -- the admin can
    // retry generating a payment link from the order detail page, or mark
    // it paid manually if they collect payment another way instead.
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Order created, but we couldn't start Stripe Checkout: ${err.message}`
          : "Order created, but we couldn't start Stripe Checkout.",
    };
  }
}

/**
 * Generates a fresh Stripe Checkout link for an existing payment_pending
 * custom order -- used when the admin needs to resend/regenerate the link
 * (e.g. the first one expired, or the customer lost it).
 */
export async function createCustomOrderCheckoutLink(orderId: string): Promise<
  { ok: true; checkoutUrl: string } | { ok: false; error: string }
> {
  const db = getDb();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { ok: false, error: "Order not found." };
  if (order.paymentStatus === "paid") return { ok: false, error: "This order is already paid." };

  const settings = await getBusinessSettings();
  const stripe = getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.customerEmail,
      line_items: [
        {
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: order.finalAmountCents,
            product_data: { name: `${order.packageName} -- order ${order.orderNumber}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: { setup_future_usage: "off_session" },
      metadata: { purpose: "custom_order_payment", orderId: order.id, orderNumber: order.orderNumber },
      success_url: `${baseUrl}/admin/orders/${order.id}?paid=1`,
      cancel_url: `${baseUrl}/admin/orders/${order.id}`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout URL.");
    return { ok: true, checkoutUrl: session.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "We couldn't start Stripe Checkout.",
    };
  }
}
