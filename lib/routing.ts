/**
 * Routing abstraction: geocoding + distance calculation.
 *
 * Section 14 of the spec requires:
 *  - an address must be validated as being inside the business's configured
 *    service area BEFORE any routing/pricing calculation happens, so we
 *    never waste an API call (or compute a nonsense price) on an address
 *    the business can't actually service.
 *  - a routing failure must NEVER produce an invented/estimated distance --
 *    callers surface a clear error and let the booking/pricing step fail,
 *    rather than falling back to a guess (e.g. straight-line distance).
 *
 * This file is deliberately the ONLY place that talks to the routing
 * provider's API (currently OpenRouteService). If the provider is ever
 * swapped, only this file -- not the booking/pricing/availability code
 * that calls it -- should need to change.
 */

export type GeocodeResult = {
  lat: number;
  lng: number;
  formatted: string;
  /** Two-letter-ish region/province code as returned by the provider (e.g. "AB"). Null if the provider didn't supply one. */
  regionCode: string | null;
  /** Full region/province name as returned by the provider (e.g. "Alberta"). Used as a fallback when regionCode is missing. */
  regionName: string | null;
};

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

const ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";

function getOrsApiKey(): string {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) {
    throw new RoutingError(
      "OPENROUTESERVICE_API_KEY is not set. Add it to your environment configuration (see .env.example)."
    );
  }
  return key;
}

/**
 * Geocodes a free-text address into coordinates + region info. Throws
 * RoutingError -- never returns a guessed location -- if the address can't
 * be resolved or the API call fails for any reason.
 */
export async function geocodeAddress(addressText: string): Promise<GeocodeResult> {
  const trimmed = addressText.trim();
  if (!trimmed) {
    throw new RoutingError("An address is required.");
  }

  const url =
    `${ORS_GEOCODE_URL}?api_key=${encodeURIComponent(getOrsApiKey())}` +
    `&text=${encodeURIComponent(trimmed)}&size=1`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new RoutingError(
      "Could not reach the routing service to verify this address. Please try again."
    );
  }

  if (!response.ok) {
    throw new RoutingError(
      `The routing service could not process this address (status ${response.status}).`
    );
  }

  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) {
    throw new RoutingError("That address could not be found. Please check it and try again.");
  }

  const coords = feature.geometry?.coordinates;
  const lng = coords?.[0];
  const lat = coords?.[1];
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new RoutingError("That address could not be resolved to a location.");
  }

  const props = feature.properties ?? {};

  return {
    lat,
    lng,
    formatted: typeof props.label === "string" ? props.label : trimmed,
    regionCode: typeof props.region_a === "string" ? props.region_a : null,
    regionName: typeof props.region === "string" ? props.region : null,
  };
}

/** Canadian province name <-> code table, used as a fallback service-area
 * check since OpenRouteService's Pelias geocoder doesn't always populate
 * the short region code (region_a) for Canadian addresses. */
const CANADIAN_PROVINCES: Record<string, string> = {
  AB: "alberta",
  BC: "british columbia",
  MB: "manitoba",
  NB: "new brunswick",
  NL: "newfoundland and labrador",
  NS: "nova scotia",
  NT: "northwest territories",
  NU: "nunavut",
  ON: "ontario",
  PE: "prince edward island",
  QC: "quebec",
  SK: "saskatchewan",
  YT: "yukon",
};

/**
 * Checks a geocoded address's province/region against the business's
 * configured service-area code (businessSettings.serviceAreaProvinceCode).
 * Must be called BEFORE any distance/pricing calculation, per Section 14.
 */
export function isWithinServiceArea(
  geocode: GeocodeResult,
  serviceAreaProvinceCode: string
): boolean {
  const code = serviceAreaProvinceCode.trim().toUpperCase();

  if (geocode.regionCode && geocode.regionCode.trim().toUpperCase() === code) {
    return true;
  }

  const expectedName = CANADIAN_PROVINCES[code];
  if (expectedName && geocode.regionName) {
    return geocode.regionName.trim().toLowerCase() === expectedName;
  }

  // Can't confirm a match (unrecognized code and/or no usable region data
  // from the provider) -- treat as out of area rather than guessing yes.
  return false;
}

/**
 * Hard service-area radius check (businessSettings.maxDeliveryRadiusKm).
 * Null/undefined means no hard cutoff is configured, so everything passes.
 */
export function isWithinMaxRadius(
  distanceKm: number,
  maxDeliveryRadiusKm: number | null | undefined
): boolean {
  if (maxDeliveryRadiusKm === null || maxDeliveryRadiusKm === undefined) return true;
  return distanceKm <= maxDeliveryRadiusKm;
}

/**
 * Calculates the one-way driving distance in kilometers between two
 * coordinates via the routing provider. Never rounds -- the pricing engine
 * decides how/when to round, per the final amendment's "never round
 * distance at any stage" rule. Throws RoutingError on any failure rather
 * than falling back to an estimate (e.g. straight-line distance).
 */
export async function calculateRouteDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<number> {
  const url =
    `${ORS_DIRECTIONS_URL}?api_key=${encodeURIComponent(getOrsApiKey())}` +
    `&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new RoutingError(
      "Could not reach the routing service to calculate distance. Please try again."
    );
  }

  if (!response.ok) {
    throw new RoutingError(
      `The routing service could not calculate a route (status ${response.status}).`
    );
  }

  const data = await response.json();
  const meters = data?.features?.[0]?.properties?.summary?.distance;
  if (typeof meters !== "number" || !Number.isFinite(meters)) {
    throw new RoutingError("The routing service did not return a usable distance for this route.");
  }

  return meters / 1000;
}

/**
 * Convenience wrapper: geocode an address, then verify it's inside the
 * configured service area. Throws RoutingError (with a customer-facing
 * message) if the address is out of area. Use this for any customer-
 * supplied address before doing anything else with it.
 */
export async function geocodeAndValidateServiceArea(
  addressText: string,
  serviceAreaProvinceCode: string
): Promise<GeocodeResult> {
  const geocode = await geocodeAddress(addressText);
  if (!isWithinServiceArea(geocode, serviceAreaProvinceCode)) {
    throw new RoutingError(
      "That address is outside our current service area. Please double-check the address, or contact us if you believe this is an error."
    );
  }
  return geocode;
}
