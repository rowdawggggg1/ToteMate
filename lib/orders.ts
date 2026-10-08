/**
 * The booking order pipeline: turns a customer's checkout submission into
 * a priced, validated, paid-pending order and a Stripe PaymentIntent.
 *
 * This is the ONE place a new order gets created, so every rule that must
 * hold for every booking lives here rather than being re-implemented by
 * each caller:
 *  - server-side validation of dates, service area, and inventory/capacity
 *    (never trust what the browser showed the customer)
 *  - server-side pricing via lib/pricing.ts (never trust a browser total)
 *  - a frozen snapshot of everything the customer is agreeing to pay for,
 *    so later catalog/settings changes can never rewrite this order
 *
 * Per the spec's "no temporary holds" decision: nothing reserves a slot
 * just by starting checkout. This function re-validates availability right
 * before creating the order + PaymentIntent, and the Stripe webhook
 * (app/api/stripe/webhook/route.ts) does an independent re-check before
 * actually marking the order paid. The small race window between those two
 * checks (two customers finishing checkout for the last tote at nearly the
 * same moment) is a conscious, documented trade-off for a small business
 * on a modest budget -- building real reservation holds would be
 * over-engineering for this scale.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  addOns,
  orders,
  packages,
  rentalAgreementVersions,
  type giftCards,
  type referralCodes,
} from "@/lib/db/schema";
import {
  checkDeliveryDateAvailability,
  checkDailyCapacity,
  checkToteAvailability,
  addWeeksToDateString,
  getBusinessSettings,
} from "@/lib/availability";
import {
  calculateOrderPricing,
  resolveFinalAmountCents,
  type AddOnLineItem,
} from "@/lib/pricing";
import {
  calculateRouteDistanceKm,
  geocodeAndValidateServiceArea,
  isWithinMaxRadius,
  RoutingError,
} from "@/lib/routing";
import { generateManageToken, hashManageToken } from "@/lib/manage-token";
import { getStripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { sendBookingConfirmationEmail } from "@/lib/email";
import {
  calculateReferralAmounts,
  findActiveReferralCode,
  isSelfReferral,
  recordReferralRedemption,
} from "@/lib/referrals";
import { applyGiftCardToOrder, findUsableGiftCard, giftCardBlocksReferralCode } from "@/lib/giftcards";

export type AddressInput = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

function formatAddressForGeocoding(a: AddressInput): string {
  return [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
}

export type AddOnSelection = { addOnId: string; quantity: number };

export type CreateBookingInput = {
  packageId: string;
  addOnSelections: AddOnSelection[];
  extensionWeeks: number;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  requestedDeliveryDate: string; // YYYY-MM-DD
  preferredDeliveryWindow?: string;
  preferredPickupWindow?: string;

  deliveryAddress: AddressInput;
  deliveryInstructions?: string;

  pickupSameAsDelivery: boolean;
  pickupAddress?: AddressInput;
  pickupInstructions?: string;

  agreementVersionId: string;
  agreementSignatureDataUrl: string;

  // --- Phase 5: optional referral code and/or gift card, verified and
  // applied server-side -- never trust a discount amount from the browser.
  referralCode?: string;
  giftCardCode?: string;
};

export type CreateBookingResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      // False when a gift card covered the entire total -- there's no
      // PaymentIntent to confirm, the order is already paid.
      requiresPayment: boolean;
      clientSecret: string | null;
      finalAmountCents: number;
      manageToken: string;
    }
  | { ok: false; error: string };

function generateOrderNumber(): string {
  const datePart = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" })
    .format(new Date())
    .replace(/-/g, "");
  const randomPart = Math.floor(100000 + Math.random() * 900000); // 6 digits
  return `TM-${datePart}-${randomPart}`;
}

export async function createBookingOrderAndPaymentIntent(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const db = getDb();
  const settings = await getBusinessSettings();

  if (settings.bookingPaused) {
    return { ok: false, error: "Online booking is temporarily paused. Please check back soon." };
  }

  // --- Package & add-ons -------------------------------------------------

  const packageRows = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, input.packageId), eq(packages.isActive, true)))
    .limit(1);
  const pkg = packageRows[0];
  if (!pkg) {
    return { ok: false, error: "That package is no longer available. Please choose another." };
  }

  const availableAddOns = await db
    .select()
    .from(addOns)
    .where(eq(addOns.isActive, true));

  const weeklyExtensionAddOn = availableAddOns.find(
    (a) => a.packageId === pkg.id && a.isWeeklyExtension
  );

  if (input.extensionWeeks > 0 && !weeklyExtensionAddOn) {
    return { ok: false, error: "This package doesn't offer a rental extension." };
  }

  const selectedAddOns: Array<{ addOnId: string; name: string; priceCents: number; quantity: number }> =
    [];
  for (const selection of input.addOnSelections) {
    if (selection.quantity <= 0) continue;
    const addOn = availableAddOns.find((a) => a.id === selection.addOnId);
    if (!addOn || addOn.isWeeklyExtension) {
      return { ok: false, error: "One of the selected add-ons is no longer available." };
    }
    if (addOn.packageId !== null && addOn.packageId !== pkg.id) {
      return { ok: false, error: "One of the selected add-ons doesn't apply to this package." };
    }
    selectedAddOns.push({
      addOnId: addOn.id,
      name: addOn.name,
      priceCents: addOn.priceCents,
      quantity: selection.quantity,
    });
  }

  // --- Dates & availability -----------------------------------------------

  const deliveryDateCheck = await checkDeliveryDateAvailability(input.requestedDeliveryDate, {
    minLeadTimeDays: settings.minLeadTimeDays,
    timezone: settings.timezone,
  });
  if (!deliveryDateCheck.ok) {
    return { ok: false, error: deliveryDateCheck.reason ?? "That delivery date isn't available." };
  }

  const confirmedPickupDate = addWeeksToDateString(
    input.requestedDeliveryDate,
    pkg.rentalDurationWeeks + input.extensionWeeks
  );

  const pickupCapacity = await checkDailyCapacity(confirmedPickupDate);
  if (!pickupCapacity.withinCapacity) {
    return { ok: false, error: "That pickup date is fully booked. Please choose another delivery date." };
  }

  const toteAvailability = await checkToteAvailability(
    input.requestedDeliveryDate,
    confirmedPickupDate,
    pkg.toteQuantity
  );
  if (!toteAvailability.available) {
    return {
      ok: false,
      error: "We don't have enough totes available for those dates. Please choose different dates.",
    };
  }

  // --- Service area & routing ----------------------------------------------

  if (!settings.businessOriginLat || !settings.businessOriginLng) {
    return {
      ok: false,
      error:
        "Delivery pricing isn't configured yet (no business origin set). Please contact us to book.",
    };
  }
  const origin = {
    lat: Number(settings.businessOriginLat),
    lng: Number(settings.businessOriginLng),
  };

  let deliveryGeocode;
  let pickupGeocode;
  try {
    deliveryGeocode = await geocodeAndValidateServiceArea(
      formatAddressForGeocoding(input.deliveryAddress),
      settings.serviceAreaProvinceCode
    );
    pickupGeocode = input.pickupSameAsDelivery
      ? deliveryGeocode
      : await geocodeAndValidateServiceArea(
          formatAddressForGeocoding(input.pickupAddress ?? input.deliveryAddress),
          settings.serviceAreaProvinceCode
        );
  } catch (err) {
    if (err instanceof RoutingError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  let deliveryDistanceKm: number;
  let pickupDistanceKm: number;
  try {
    deliveryDistanceKm = await calculateRouteDistanceKm(origin, {
      lat: deliveryGeocode.lat,
      lng: deliveryGeocode.lng,
    });
    pickupDistanceKm = input.pickupSameAsDelivery
      ? deliveryDistanceKm
      : await calculateRouteDistanceKm(origin, { lat: pickupGeocode.lat, lng: pickupGeocode.lng });
  } catch (err) {
    if (err instanceof RoutingError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const maxRadius = settings.maxDeliveryRadiusKm ? Number(settings.maxDeliveryRadiusKm) : null;
  if (!isWithinMaxRadius(deliveryDistanceKm, maxRadius) || !isWithinMaxRadius(pickupDistanceKm, maxRadius)) {
    return {
      ok: false,
      error: "That address is outside our maximum delivery range. Please contact us to check options.",
    };
  }

  // --- Agreement -------------------------------------------------------------

  const agreementRows = await db
    .select()
    .from(rentalAgreementVersions)
    .where(
      and(
        eq(rentalAgreementVersions.id, input.agreementVersionId),
        eq(rentalAgreementVersions.status, "active")
      )
    )
    .limit(1);
  const agreement = agreementRows[0];
  if (!agreement) {
    return {
      ok: false,
      error: "The rental agreement has been updated. Please refresh the page and try again.",
    };
  }
  if (!input.agreementSignatureDataUrl) {
    return { ok: false, error: "A signature is required to complete booking." };
  }

  // --- Pricing -------------------------------------------------------------

  const addOnLineItems: AddOnLineItem[] = selectedAddOns.map((a) => ({
    priceCents: a.priceCents,
    quantity: a.quantity,
  }));

  const pricing = calculateOrderPricing({
    packagePriceCents: pkg.priceCents,
    addOns: addOnLineItems,
    weeklyExtensionPriceCents: weeklyExtensionAddOn?.priceCents ?? null,
    extensionWeeks: input.extensionWeeks,
    deliveryDistanceKm,
    deliveryFreeRadiusKm: Number(settings.deliveryFreeRadiusKm),
    deliveryRateCentsPerKm: settings.deliveryRateCentsPerKm,
    pickupDistanceKm,
    pickupFreeRadiusKm: Number(settings.pickupFreeRadiusKm),
    pickupRateCentsPerKm: settings.pickupRateCentsPerKm,
  });
  const computedTotalCents = resolveFinalAmountCents(pricing.computedTotalCents, null);

  // --- Phase 5: referral code + gift card (both optional, both verified
  // server-side) -----------------------------------------------------------

  let referralCode: typeof referralCodes.$inferSelect | null = null;
  let referralDiscountCents = 0;
  let referrerRewardCents = 0;
  if (input.referralCode) {
    const lookup = await findActiveReferralCode(input.referralCode);
    if (!lookup.ok) return { ok: false, error: lookup.error };
    if (isSelfReferral(lookup.referralCode, input.customerEmail)) {
      return { ok: false, error: "You can't use your own referral code." };
    }
    referralCode = lookup.referralCode;
    const amounts = calculateReferralAmounts(settings, referralCode, computedTotalCents);
    referralDiscountCents = amounts.refereeDiscountCents;
    referrerRewardCents = amounts.referrerRewardCents;
  }

  let giftCard: typeof giftCards.$inferSelect | null = null;
  let giftCardAmountToApplyCents = 0;
  if (input.giftCardCode) {
    const lookup = await findUsableGiftCard(input.giftCardCode);
    if (!lookup.ok) return { ok: false, error: lookup.error };
    giftCard = lookup.giftCard;
    if (referralCode && giftCardBlocksReferralCode(giftCard)) {
      return {
        ok: false,
        error:
          "This gift card can't be combined with a referral code, since it already came with a discount. You're welcome to use one or the other.",
      };
    }
    const amountAfterReferral = Math.max(0, computedTotalCents - referralDiscountCents);
    giftCardAmountToApplyCents = Math.min(giftCard.balanceCents, amountAfterReferral);
  }

  const finalAmountCents = Math.max(
    0,
    computedTotalCents - referralDiscountCents - giftCardAmountToApplyCents
  );

  if (computedTotalCents <= 0) {
    return { ok: false, error: "There was a problem calculating the total for this order." };
  }

  // --- Create the order (draft) + Stripe PaymentIntent -----------------------

  const manageToken = generateManageToken();
  const manageTokenHash = hashManageToken(manageToken);

  const stripe = getStripe();

  // A gift card can cover the entire order (finalAmountCents === 0) --
  // there's then nothing for Stripe to charge, so no Customer/PaymentIntent
  // is created at all; the order is marked paid immediately below instead
  // of waiting on the webhook. Otherwise, a Stripe Customer +
  // setup_future_usage: "off_session" saves the card for later, so an
  // admin can charge a late fee on-demand afterward (Phase 4) without the
  // customer re-entering their card. This only *saves* the method --
  // nothing is ever charged again without a separate, explicit admin
  // action later.
  const requiresPayment = finalAmountCents > 0;
  let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>> | null = null;
  if (requiresPayment) {
    const stripeCustomer = await stripe.customers.create({
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
    });
    paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmountCents,
      currency: settings.currency.toLowerCase(),
      customer: stripeCustomer.id,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: "off_session",
      metadata: { orderNumber: "" }, // filled in once we know the order id, below
    });
  }

  let orderId: string | undefined;
  let orderNumber = generateOrderNumber();
  let lastInsertError: unknown;

  for (let attempt = 0; attempt < 3 && !orderId; attempt++) {
    try {
      const inserted = await db
        .insert(orders)
        .values({
          orderNumber,
          status: requiresPayment ? "payment_pending" : "scheduled",
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

          addOns: selectedAddOns,

          requestedDeliveryDate: input.requestedDeliveryDate,
          confirmedDeliveryDate: input.requestedDeliveryDate,
          requestedPickupDate: confirmedPickupDate,
          confirmedPickupDate: confirmedPickupDate,
          preferredDeliveryWindow: input.preferredDeliveryWindow || null,
          preferredPickupWindow: input.preferredPickupWindow || null,

          deliveryAddress: { ...input.deliveryAddress, formatted: deliveryGeocode.formatted, lat: deliveryGeocode.lat, lng: deliveryGeocode.lng },
          pickupSameAsDelivery: input.pickupSameAsDelivery,
          pickupAddress: input.pickupSameAsDelivery
            ? null
            : {
                ...(input.pickupAddress as AddressInput),
                formatted: pickupGeocode.formatted,
                lat: pickupGeocode.lat,
                lng: pickupGeocode.lng,
              },
          deliveryInstructions: input.deliveryInstructions || null,
          pickupInstructions: input.pickupInstructions || null,

          deliveryDistanceKm: deliveryDistanceKm.toFixed(3),
          pickupDistanceKm: pickupDistanceKm.toFixed(3),
          deliveryFreeRadiusKmUsed: settings.deliveryFreeRadiusKm,
          pickupFreeRadiusKmUsed: settings.pickupFreeRadiusKm,
          deliveryRateCentsPerKmUsed: settings.deliveryRateCentsPerKm,
          pickupRateCentsPerKmUsed: settings.pickupRateCentsPerKm,
          deliveryFeeCents: pricing.deliveryFeeCents,
          pickupFeeCents: pricing.pickupFeeCents,

          referralCodeId: referralCode?.id ?? null,
          referralDiscountCents,
          referralRewardOwedCents: referrerRewardCents,
          giftCardId: giftCard?.id ?? null,
          giftCardAmountAppliedCents: giftCardAmountToApplyCents,

          finalAmountCents,
          currency: settings.currency,

          paymentStatus: requiresPayment ? "pending" : "paid",
          paidAt: requiresPayment ? null : new Date(),
          stripePaymentIntentId: paymentIntent?.id ?? null,

          agreementVersionId: agreement.id,
          agreementVersionLabel: agreement.versionLabel,
          agreementContentSnapshot: agreement.content,
          agreementSignatureDataUrl: input.agreementSignatureDataUrl,
          agreementSignedAt: new Date(),

          manageTokenHash,
        })
        .returning({ id: orders.id });
      orderId = inserted[0]?.id;
    } catch (err) {
      // Most likely an order-number collision (vanishingly unlikely) --
      // try a new one. If it's something else, this still retries a
      // couple of times, but we log the real reason below so it's not
      // silently lost.
      lastInsertError = err;
      orderNumber = generateOrderNumber();
    }
  }

  if (!orderId) {
    // Clean up the PaymentIntent we created but never attached to an order.
    if (paymentIntent) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
    }
    await writeAudit({
      actor: { type: "system" },
      action: "ORDER_CREATION_FAILED",
      entityType: "order",
      notes: lastInsertError instanceof Error ? lastInsertError.message : String(lastInsertError),
    }).catch(() => {});
    return { ok: false, error: "We couldn't create your booking. Please try again." };
  }

  if (!requiresPayment) {
    // Fully covered by a gift card -- there's no webhook coming, so apply
    // the gift card balance / record the referral redemption and send the
    // confirmation email right here, synchronously, the same way the
    // webhook does for a normal paid order (see
    // app/api/stripe/webhook/route.ts's handlePaymentSucceeded).
    if (giftCard) {
      await applyGiftCardToOrder({
        giftCard,
        orderId,
        orderTotalBeforeGiftCardCents: Math.max(0, computedTotalCents - referralDiscountCents),
      });
    }
    if (referralCode) {
      await recordReferralRedemption({
        referralCodeId: referralCode.id,
        orderId,
        refereeDiscountCents: referralDiscountCents,
        referrerRewardCents,
      });
    }
    await writeAudit({ actor: { type: "system" }, action: "ORDER_PAID", entityType: "order", entityId: orderId });

    const paidOrderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (paidOrderRows[0]) {
      await sendBookingConfirmationEmail(paidOrderRows[0], manageToken).catch(() => {});
    }

    return {
      ok: true,
      orderId,
      orderNumber,
      requiresPayment: false,
      clientSecret: null,
      finalAmountCents,
      manageToken,
    };
  }

  // requiresPayment is true here, so paymentIntent was always created above.
  if (!paymentIntent) {
    return { ok: false, error: "We couldn't start payment for this booking. Please try again." };
  }

  await stripe.paymentIntents.update(paymentIntent.id, {
    metadata: { orderId, orderNumber },
  });

  if (!paymentIntent.client_secret) {
    return { ok: false, error: "We couldn't start payment for this booking. Please try again." };
  }

  return {
    ok: true,
    orderId,
    orderNumber,
    requiresPayment: true,
    clientSecret: paymentIntent.client_secret,
    finalAmountCents,
    manageToken,
  };
}
