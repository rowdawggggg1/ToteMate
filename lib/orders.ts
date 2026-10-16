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
 * before staging the booking + creating the PaymentIntent, and the Stripe
 * webhook (app/api/stripe/webhook/route.ts) does an independent re-check
 * before actually promoting it into a real order. The small race window
 * between those two checks (two customers finishing checkout for the last
 * tote at nearly the same moment) is a conscious, documented trade-off for
 * a small business on a modest budget -- building real reservation holds
 * would be over-engineering for this scale.
 *
 * --- Deferred order creation ---
 * A checkout that merely reaches the payment step must NOT create a real
 * `orders` row: an abandoned or retried checkout would otherwise sit in
 * Admin's Orders list forever as "payment_pending" clutter, and there'd be
 * no safe way to let the customer go back and fix something (e.g. a typo'd
 * address) without starting completely over. So when payment is required,
 * this function stages the full order payload in `pendingBookings` (keyed
 * by the Stripe PaymentIntent id) instead of writing to `orders` --
 * nothing appears in Admin until the webhook confirms payment actually
 * succeeded and promotes the staged row into a real order. The one
 * exception is a gift card that covers the entire total: there's no
 * PaymentIntent/webhook coming at all in that case, so the order is
 * written directly, already paid, exactly as before.
 */

import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  addOns,
  orders,
  packages,
  pendingBookings,
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
  geocodeAndValidateServiceAreaStructured,
  assessGeocode,
  isWithinMaxRadius,
  RoutingError,
  type StructuredAddressInput,
} from "@/lib/routing";
import { generateManageToken, hashManageToken } from "@/lib/manage-token";
import { allocateNextOrderNumber } from "@/lib/order-number";
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

// A staged booking that never completes payment is cleaned up after this
// long -- generous enough for a customer to step away mid-checkout and
// come back, short enough not to accumulate indefinitely.
const PENDING_BOOKING_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export type AddressInput = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export function formatAddressForGeocoding(a: AddressInput): string {
  return [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
}

/** Maps our address form fields onto ORS's structured-geocoding params --
 * see geocodeAddressStructured's doc comment for why structured (discrete
 * fields) beats free-text concatenation for precise civic-number matches. */
function toStructuredGeocodeInput(
  a: AddressInput,
  focus?: { lat: number; lng: number }
): StructuredAddressInput {
  return {
    focus,
    address: a.street,
    locality: a.city,
    region: a.province,
    postalcode: a.postalCode,
    country: a.country,
  };
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
  // Patch 5: if the customer dragged the map-preview pin to correct a
  // low-confidence (or just plain wrong) geocode match, this is where that
  // adjusted point lands -- used for the actual distance/pricing
  // calculation in place of the typed address's own geocode result. The
  // typed address is still geocoded and still has to pass the service-area
  // check either way (see createBookingOrderAndPaymentIntent); only the
  // exact point used for routing is overridden, since trusting an
  // arbitrary customer-supplied lat/lng for the area check itself would
  // defeat the point of that check.
  deliveryLatLngOverride?: { lat: number; lng: number } | null;

  pickupSameAsDelivery: boolean;
  pickupAddress?: AddressInput;
  pickupInstructions?: string;
  pickupLatLngOverride?: { lat: number; lng: number } | null;

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
      // PaymentIntent to confirm, the order is already paid and already a
      // real `orders` row.
      requiresPayment: boolean;
      clientSecret: string | null;
      stripePaymentIntentId: string | null;
      finalAmountCents: number;
      manageToken: string;
      // Resolved/geocoded addresses, for showing the customer exactly what
      // location we're going to use -- and a flag for when the match was
      // ambiguous (e.g. a road with no civic number) so the UI can warn
      // them and offer to go back and add more detail, per the decision to
      // solve address accuracy with confirmation + better input rather
      // than a routing-provider swap.
      resolvedDeliveryAddress: string;
      deliveryAddressLowConfidence: boolean;
      resolvedPickupAddress: string | null;
      pickupAddressLowConfidence: boolean;
      // Customer DID type a house number, but our map data has no point for
      // that exact house -- price/distance is based on the street. A soft
      // note, not a "go back and add a house number" warning.
      deliveryAddressApproximate: boolean;
      pickupAddressApproximate: boolean;
    }
  | { ok: false; error: string };

export async function createBookingOrderAndPaymentIntent(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const db = getDb();

  // Per-step timing, written to the server logs (Vercel -> Logs, search
  // "[booking-timing]") so a slow checkout can be traced to the exact step
  // that's slow instead of guessed at.
  const startedAt = Date.now();
  let lastLap = startedAt;
  const lap = (label: string) => {
    const now = Date.now();
    console.log(`[booking-timing] ${label}: +${now - lastLap}ms (total ${now - startedAt}ms)`);
    lastLap = now;
  };

  // Opportunistic cleanup of abandoned staged bookings. Best-effort: a
  // failure here should never block a real booking from going through, so
  // it runs alongside the settings lookup rather than ahead of it.
  const [settings] = await Promise.all([
    getBusinessSettings(),
    db.delete(pendingBookings).where(lt(pendingBookings.expiresAt, new Date())).catch(() => {}),
  ]);
  lap("settings + cleanup");

  if (settings.bookingPaused) {
    return { ok: false, error: "Online booking is temporarily paused. Please check back soon." };
  }

  // --- Package & add-ons -------------------------------------------------

  // Package, add-ons and the agreement version are independent lookups.
  const [packageRows, availableAddOns, agreementRows] = await Promise.all([
    db
      .select()
      .from(packages)
      .where(and(eq(packages.id, input.packageId), eq(packages.isActive, true)))
      .limit(1),
    db.select().from(addOns).where(eq(addOns.isActive, true)),
    db
      .select()
      .from(rentalAgreementVersions)
      .where(
        and(
          eq(rentalAgreementVersions.id, input.agreementVersionId),
          eq(rentalAgreementVersions.status, "active")
        )
      )
      .limit(1),
  ]);
  lap("package + add-ons + agreement");
  const pkg = packageRows[0];
  if (!pkg) {
    return { ok: false, error: "That package is no longer available. Please choose another." };
  }

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

  // --- Service area & routing (started FIRST, awaited after availability) --
  //
  // Geocoding + routing are slow external calls and don't depend on the
  // availability checks at all (or vice versa), so the whole routing
  // pipeline is kicked off now and runs while the database availability
  // checks below do their work, instead of the two happening back to back.
  // The promise never rejects (every failure is returned as a value), so an
  // early return below can't leave an unhandled rejection behind.

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

  const routingPromise = (async () => {
    try {
      // Delivery and (when different) pickup are independent -> parallel.
      // Search results are biased toward the business origin so a common
      // street name ("60 St") resolves to the nearby town first.
      const focus = origin;
      const deliveryGeocodeP = geocodeAndValidateServiceAreaStructured(
        toStructuredGeocodeInput(input.deliveryAddress, focus),
        settings.serviceAreaProvinceCode
      );
      const pickupGeocodeP = input.pickupSameAsDelivery
        ? deliveryGeocodeP
        : geocodeAndValidateServiceAreaStructured(
            toStructuredGeocodeInput(input.pickupAddress ?? input.deliveryAddress, focus),
            settings.serviceAreaProvinceCode
          );
      const [deliveryGeocode, pickupGeocode] = await Promise.all([deliveryGeocodeP, pickupGeocodeP]);

      // Patch 5: use the customer's map-preview pin adjustment (if any) as
      // the actual point to route from, instead of the geocoder's own
      // match -- see CreateBookingInput.deliveryLatLngOverride's doc
      // comment for why this doesn't also change what the service-area
      // check validated against.
      const deliveryCoords = input.deliveryLatLngOverride ?? {
        lat: deliveryGeocode.lat,
        lng: deliveryGeocode.lng,
      };
      const pickupCoords = input.pickupSameAsDelivery
        ? deliveryCoords
        : input.pickupLatLngOverride ?? { lat: pickupGeocode.lat, lng: pickupGeocode.lng };

      const [deliveryDistanceKm, pickupDistanceKm] = input.pickupSameAsDelivery
        ? await calculateRouteDistanceKm(origin, deliveryCoords).then((d) => [d, d] as const)
        : await Promise.all([
            calculateRouteDistanceKm(origin, deliveryCoords),
            calculateRouteDistanceKm(origin, pickupCoords),
          ]);

      return {
        ok: true as const,
        deliveryGeocode,
        pickupGeocode,
        deliveryCoords,
        pickupCoords,
        deliveryDistanceKm,
        pickupDistanceKm,
      };
    } catch (err) {
      if (err instanceof RoutingError) {
        return { ok: false as const, error: err.message };
      }
      console.error("[booking] unexpected routing failure", err);
      return {
        ok: false as const,
        error: "We couldn't verify that address right now. Please try again.",
      };
    }
  })();

  // --- Dates & availability -----------------------------------------------

  // These three checks don't depend on each other's results (the pickup
  // date is derived from the requested delivery date + package duration,
  // not from deliveryDateCheck), so run them concurrently.
  const confirmedPickupDate = addWeeksToDateString(
    input.requestedDeliveryDate,
    pkg.rentalDurationWeeks + input.extensionWeeks
  );

  const [deliveryDateCheck, pickupCapacity, toteAvailability] = await Promise.all([
    checkDeliveryDateAvailability(input.requestedDeliveryDate, {
      minLeadTimeDays: settings.minLeadTimeDays,
      timezone: settings.timezone,
    }),
    checkDailyCapacity(confirmedPickupDate),
    checkToteAvailability(input.requestedDeliveryDate, confirmedPickupDate, pkg.toteQuantity),
  ]);
  lap("availability checks");

  if (!deliveryDateCheck.ok) {
    return { ok: false, error: deliveryDateCheck.reason ?? "That delivery date isn't available." };
  }
  if (!pickupCapacity.withinCapacity) {
    return { ok: false, error: "That pickup date is fully booked. Please choose another delivery date." };
  }
  if (!toteAvailability.available) {
    return {
      ok: false,
      error: "We don't have enough totes available for those dates. Please choose different dates.",
    };
  }

  const routing = await routingPromise;
  lap("routing (geocode + distance) -- ran in parallel with availability");
  if (!routing.ok) {
    return { ok: false, error: routing.error };
  }
  const {
    deliveryGeocode,
    pickupGeocode,
    deliveryCoords,
    pickupCoords,
    deliveryDistanceKm,
    pickupDistanceKm,
  } = routing;

  const maxRadius = settings.maxDeliveryRadiusKm ? Number(settings.maxDeliveryRadiusKm) : null;
  if (!isWithinMaxRadius(deliveryDistanceKm, maxRadius) || !isWithinMaxRadius(pickupDistanceKm, maxRadius)) {
    return {
      ok: false,
      error: "That address is outside our maximum delivery range. Please contact us to check options.",
    };
  }

  // A manual pin placement means the customer already resolved the
  // ambiguity themselves, so there's nothing left to warn them about.
  const deliveryAssessment = assessGeocode(deliveryGeocode, {
    street: input.deliveryAddress.street,
    city: input.deliveryAddress.city,
  });
  const pickupAssessment = input.pickupSameAsDelivery
    ? deliveryAssessment
    : assessGeocode(pickupGeocode, {
        street: (input.pickupAddress ?? input.deliveryAddress).street,
        city: (input.pickupAddress ?? input.deliveryAddress).city,
      });
  const deliveryAddressLowConfidence =
    !input.deliveryLatLngOverride && deliveryAssessment.lowConfidence;
  const deliveryAddressApproximate =
    !input.deliveryLatLngOverride && deliveryAssessment.approximate;
  const pickupAddressLowConfidence = input.pickupSameAsDelivery
    ? deliveryAddressLowConfidence
    : !input.pickupLatLngOverride && pickupAssessment.lowConfidence;
  const pickupAddressApproximate = input.pickupSameAsDelivery
    ? deliveryAddressApproximate
    : !input.pickupLatLngOverride && pickupAssessment.approximate;

  // --- Agreement -------------------------------------------------------------

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

  // --- Build the frozen order snapshot (not written anywhere yet) ----------

  const manageToken = generateManageToken();
  const orderId = crypto.randomUUID();
  lap("pricing + referral/gift card");
  const orderNumber = await allocateNextOrderNumber();
  lap("order number");

  const orderValues = {
    orderNumber,
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

    deliveryAddress: {
      ...input.deliveryAddress,
      formatted: deliveryGeocode.formatted,
      // Stores the point actually used for routing/pricing -- the
      // customer's dragged pin when there is one, otherwise the geocoder's
      // own match (deliveryCoords already resolves that, see above).
      lat: deliveryCoords.lat,
      lng: deliveryCoords.lng,
    },
    pickupSameAsDelivery: input.pickupSameAsDelivery,
    pickupAddress: input.pickupSameAsDelivery
      ? null
      : {
          ...(input.pickupAddress as AddressInput),
          formatted: pickupGeocode.formatted,
          lat: pickupCoords.lat,
          lng: pickupCoords.lng,
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

    agreementVersionId: agreement.id,
    agreementVersionLabel: agreement.versionLabel,
    agreementContentSnapshot: agreement.content,
    agreementSignatureDataUrl: input.agreementSignatureDataUrl,
    // Kept as a real Date here; converted explicitly (not relied on via
    // JSON round-trip) wherever this snapshot ends up inserted -- see the
    // $0 branch below and the webhook's promotion logic.
    agreementSignedAt: new Date(),
  };

  const requiresPayment = finalAmountCents > 0;

  // --- $0 total (gift card covers everything): no PaymentIntent/webhook
  // is coming, so write the real order directly, already paid. -----------

  if (!requiresPayment) {
    const manageTokenHash = hashManageToken(manageToken);
    let insertedOrderId: string | undefined;
    try {
      const inserted = await db
        .insert(orders)
        .values({
          id: orderId,
          ...orderValues,
          status: "scheduled",
          paymentStatus: "paid",
          paidAt: new Date(),
          stripePaymentIntentId: null,
          manageTokenHash,
        })
        .returning({ id: orders.id });
      insertedOrderId = inserted[0]?.id;
    } catch (err) {
      await writeAudit({
        actor: { type: "system" },
        action: "ORDER_CREATION_FAILED",
        entityType: "order",
        notes: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
      return { ok: false, error: "We couldn't create your booking. Please try again." };
    }

    if (giftCard) {
      await applyGiftCardToOrder({
        giftCard,
        orderId: insertedOrderId!,
        orderTotalBeforeGiftCardCents: Math.max(0, computedTotalCents - referralDiscountCents),
      });
    }
    if (referralCode) {
      await recordReferralRedemption({
        referralCodeId: referralCode.id,
        orderId: insertedOrderId!,
        refereeDiscountCents: referralDiscountCents,
        referrerRewardCents,
      });
    }
    await writeAudit({ actor: { type: "system" }, action: "ORDER_PAID", entityType: "order", entityId: insertedOrderId! });

    const paidOrderRows = await db.select().from(orders).where(eq(orders.id, insertedOrderId!)).limit(1);
    if (paidOrderRows[0]) {
      await sendBookingConfirmationEmail(paidOrderRows[0], manageToken).catch(() => {});
    }

    return {
      ok: true,
      orderId: insertedOrderId!,
      orderNumber,
      requiresPayment: false,
      clientSecret: null,
      stripePaymentIntentId: null,
      finalAmountCents,
      manageToken,
      resolvedDeliveryAddress: deliveryGeocode.formatted,
      deliveryAddressLowConfidence,
      resolvedPickupAddress: input.pickupSameAsDelivery ? null : pickupGeocode.formatted,
      pickupAddressLowConfidence,
      deliveryAddressApproximate,
      pickupAddressApproximate,
    };
  }

  // --- Payment required: create the PaymentIntent, then STAGE the order
  // in pendingBookings -- nothing is written to `orders` until the webhook
  // confirms payment succeeded. -------------------------------------------

  const stripe = getStripe();
  // A Stripe Customer + setup_future_usage: "off_session" saves the card
  // for later, so an admin can charge a late fee on-demand afterward
  // (Phase 4) without the customer re-entering their card. This only
  // *saves* the method -- nothing is ever charged again without a
  // separate, explicit admin action later.
  const stripeCustomer = await stripe.customers.create({
    name: input.customerName,
    email: input.customerEmail,
    phone: input.customerPhone,
  });
  lap("stripe customer");
  const paymentIntent = await stripe.paymentIntents.create({
    amount: finalAmountCents,
    currency: settings.currency.toLowerCase(),
    customer: stripeCustomer.id,
    automatic_payment_methods: { enabled: true },
    setup_future_usage: "off_session",
    metadata: { orderId, orderNumber },
  });

  lap("stripe payment intent");
  if (!paymentIntent.client_secret) {
    await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
    return { ok: false, error: "We couldn't start payment for this booking. Please try again." };
  }

  try {
    await db.insert(pendingBookings).values({
      id: orderId,
      stripePaymentIntentId: paymentIntent.id,
      orderNumber,
      payload: orderValues,
      manageToken,
      expiresAt: new Date(Date.now() + PENDING_BOOKING_TTL_MS),
    });
  } catch (err) {
    await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
    await writeAudit({
      actor: { type: "system" },
      action: "ORDER_CREATION_FAILED",
      entityType: "order",
      notes: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return { ok: false, error: "We couldn't create your booking. Please try again." };
  }

  lap("staged booking saved");
  return {
    ok: true,
    orderId,
    orderNumber,
    requiresPayment: true,
    clientSecret: paymentIntent.client_secret,
    stripePaymentIntentId: paymentIntent.id,
    finalAmountCents,
    manageToken,
    resolvedDeliveryAddress: deliveryGeocode.formatted,
    deliveryAddressLowConfidence,
    resolvedPickupAddress: input.pickupSameAsDelivery ? null : pickupGeocode.formatted,
    pickupAddressLowConfidence,
    deliveryAddressApproximate,
    pickupAddressApproximate,
  };
}

/**
 * Called when a customer clicks "Back" from the payment step (or abandons
 * it): deletes the staged booking and cancels the now-unneeded
 * PaymentIntent. Best-effort and silent -- if the PaymentIntent already
 * succeeded (the customer actually paid moments before clicking back, an
 * unlikely but possible race) Stripe will simply reject the cancel, which
 * is fine, since the webhook's promotion will have already (or will soon)
 * turn this into a real paid order instead.
 */
export async function cancelPendingBooking(stripePaymentIntentId: string): Promise<void> {
  const db = getDb();
  try {
    await db.delete(pendingBookings).where(eq(pendingBookings.stripePaymentIntentId, stripePaymentIntentId));
  } catch {
    // ignore
  }
  try {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(stripePaymentIntentId);
  } catch {
    // ignore -- already succeeded, already canceled, or never needed
  }
}

/**
 * Whether a staged booking has been promoted into a real `orders` row yet.
 * Used by the booking wizard's confirmation screen to ride out the brief
 * race window between Stripe confirming payment client-side and the
 * webhook actually promoting the staged booking server-side.
 */
export async function isOrderReady(orderId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows.length > 0;
}
