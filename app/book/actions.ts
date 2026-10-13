"use server";

import {
  cancelPendingBooking,
  createBookingOrderAndPaymentIntent,
  isOrderReady,
  type CreateBookingInput,
  type CreateBookingResult,
} from "@/lib/orders";
import { getBusinessSettings } from "@/lib/availability";
import {
  geocodeAndValidateServiceAreaStructured,
  isLowConfidenceGeocode,
  RoutingError,
} from "@/lib/routing";

/**
 * Thin Server Action boundary so the client wizard can call the booking
 * pipeline directly (not through a <form>) while keeping lib/orders.ts a
 * plain server-only module. All real validation/pricing logic lives there.
 */
export async function submitBookingAction(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  return createBookingOrderAndPaymentIntent(input);
}

/**
 * Called when the customer clicks "Back" from the payment step (e.g. to
 * fix an address). Deletes the staged booking and cancels its
 * PaymentIntent, so it never lingers as a payment attempt and never
 * becomes an order -- the wizard then returns to an earlier step so they
 * can submit a fresh booking when ready.
 */
export async function cancelPendingBookingAction(stripePaymentIntentId: string): Promise<void> {
  await cancelPendingBooking(stripePaymentIntentId);
}

/**
 * Polled by the confirmation screen right after Stripe confirms payment
 * client-side, to ride out the brief race window before the webhook
 * promotes the staged booking into a real order (the webhook is what
 * actually sends the confirmation email and makes the order visible in
 * Admin -- see app/api/stripe/webhook/route.ts).
 */
export async function isOrderReadyAction(orderId: string): Promise<boolean> {
  return isOrderReady(orderId);
}

export type GeocodePreviewResult =
  | { ok: true; lat: number; lng: number; formatted: string; lowConfidence: boolean }
  | { ok: false; error: string };

/**
 * Patch 5: lets the booking wizard show a map preview of an address (with
 * a draggable pin to fix it) BEFORE the customer reaches the rental
 * agreement, instead of only finding out an address was ambiguous after
 * "Continue to payment". Read-only -- doesn't create/charge anything, just
 * runs the same structured geocode the real booking will use so the map
 * shows the same point pricing/routing would.
 */
export async function previewGeocodeAction(address: {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}): Promise<GeocodePreviewResult> {
  const settings = await getBusinessSettings();
  try {
    const geocode = await geocodeAndValidateServiceAreaStructured(
      {
        address: address.street,
        locality: address.city,
        region: address.province,
        postalcode: address.postalCode,
        country: address.country,
      },
      settings.serviceAreaProvinceCode
    );
    return {
      ok: true,
      lat: geocode.lat,
      lng: geocode.lng,
      formatted: geocode.formatted,
      lowConfidence: isLowConfidenceGeocode(geocode),
    };
  } catch (err) {
    if (err instanceof RoutingError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not look up that address. Please try again." };
  }
}
