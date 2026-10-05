/**
 * Pricing engine. This is the ONLY place order totals are calculated --
 * never trust a price computed in the browser (Section 15 / final
 * amendment). Every function here is a pure, synchronous calculation over
 * numbers already looked up server-side (package/add-on snapshots, a
 * routed distance, current settings); nothing here calls the database or
 * the routing provider itself.
 *
 * Locked formula (final amendment, supersedes anything in the numbered
 * sections): for each leg (delivery, pickup) independently --
 *
 *   fee = max(0, routedOneWayDistanceKm - freeRadiusKm) * 2 * ratePerKm
 *
 * - "* 2" accounts for the round trip the driver actually makes, even
 *   though only the one-way distance is used as the billable basis.
 * - The free radius is applied separately per leg (a delivery and a
 *   pickup each get their own free-radius allowance).
 * - Distance is never rounded at any stage of this calculation. Only the
 *   final result -- money, which only exists in whole cents -- is rounded,
 *   and only once, at the very end of each function below.
 */

export type AddOnLineItem = {
  priceCents: number;
  quantity: number;
};

/**
 * Delivery or pickup fee for one leg, in cents. `distanceKm` is the
 * one-way routed distance for that leg; `freeRadiusKm` and
 * `rateCentsPerKm` are that leg's own settings (delivery and pickup each
 * have independent values).
 */
export function calculateLegFeeCents(
  distanceKm: number,
  freeRadiusKm: number,
  rateCentsPerKm: number
): number {
  const billableKm = Math.max(0, distanceKm - freeRadiusKm);
  const feeCents = billableKm * 2 * rateCentsPerKm;
  return Math.round(feeCents);
}

/** Sum of add-on line items (price * quantity each), in cents. */
export function calculateAddOnsTotalCents(addOns: AddOnLineItem[]): number {
  return addOns.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

/**
 * Cost of the rental extension, in cents. An extension is always whole
 * weeks at the package's own weekly-extension add-on price -- never
 * prorated (final amendment: full weeks only, no partial-week pricing).
 * `weeklyExtensionPriceCents` is null when the package has no configured
 * extension add-on; extensionWeeks should be 0 in that case.
 */
export function calculateExtensionTotalCents(
  weeklyExtensionPriceCents: number | null,
  extensionWeeks: number
): number {
  if (extensionWeeks <= 0 || weeklyExtensionPriceCents === null) return 0;
  return weeklyExtensionPriceCents * extensionWeeks;
}

export type OrderPricingInput = {
  packagePriceCents: number;
  addOns: AddOnLineItem[];
  weeklyExtensionPriceCents: number | null;
  extensionWeeks: number;

  deliveryDistanceKm: number;
  deliveryFreeRadiusKm: number;
  deliveryRateCentsPerKm: number;

  /** Only priced when the pickup address differs from delivery; pass 0/0/0 and a 0 distance when pickupSameAsDelivery is true AND the business doesn't charge a separate pickup fee in that case -- see note below. */
  pickupDistanceKm: number;
  pickupFreeRadiusKm: number;
  pickupRateCentsPerKm: number;
};

export type OrderPricingBreakdown = {
  packagePriceCents: number;
  addOnsTotalCents: number;
  extensionTotalCents: number;
  deliveryFeeCents: number;
  pickupFeeCents: number;
  /** Sum of every line above -- the computed total before any admin override. */
  computedTotalCents: number;
};

/**
 * Full order pricing breakdown from server-verified inputs. Delivery and
 * pickup fees are calculated independently (separate distance, separate
 * free radius, separate rate per leg), per the locked formula.
 */
export function calculateOrderPricing(input: OrderPricingInput): OrderPricingBreakdown {
  const addOnsTotalCents = calculateAddOnsTotalCents(input.addOns);
  const extensionTotalCents = calculateExtensionTotalCents(
    input.weeklyExtensionPriceCents,
    input.extensionWeeks
  );
  const deliveryFeeCents = calculateLegFeeCents(
    input.deliveryDistanceKm,
    input.deliveryFreeRadiusKm,
    input.deliveryRateCentsPerKm
  );
  const pickupFeeCents = calculateLegFeeCents(
    input.pickupDistanceKm,
    input.pickupFreeRadiusKm,
    input.pickupRateCentsPerKm
  );

  const computedTotalCents =
    input.packagePriceCents +
    addOnsTotalCents +
    extensionTotalCents +
    deliveryFeeCents +
    pickupFeeCents;

  return {
    packagePriceCents: input.packagePriceCents,
    addOnsTotalCents,
    extensionTotalCents,
    deliveryFeeCents,
    pickupFeeCents,
    computedTotalCents,
  };
}

/**
 * Resolves the final amount actually charged: an admin's manual price
 * override (Section 15 / final amendment: "admin must be able to
 * manually override distance and/or price when necessary") always wins
 * over the computed total when present. `priceOverrideCents` is null/
 * undefined when no override has been applied.
 */
export function resolveFinalAmountCents(
  computedTotalCents: number,
  priceOverrideCents: number | null | undefined
): number {
  return priceOverrideCents ?? computedTotalCents;
}

/**
 * Cancellation-fee calculation (Section 23), from the business's current
 * settings. `feeType` is "fixed" (flat cents amount) or "percentage" (of
 * the order's final amount). Returns 0 when the cancellation happens
 * outside the configured window (i.e. the caller determined a refund is
 * owed in full) -- window logic itself lives in lib/availability.ts since
 * it depends on dates/timezone, not pricing math.
 */
export function calculateCancellationFeeCents(
  finalAmountCents: number,
  feeType: "fixed" | "percentage",
  fixedFeeCents: number,
  feePercentage: number
): number {
  if (feeType === "percentage") {
    return Math.round((finalAmountCents * feePercentage) / 100);
  }
  return fixedFeeCents;
}
