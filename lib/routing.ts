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
  /** Pelias confidence score, 0-1. Null if the provider didn't supply one. */
  confidence: number | null;
  /** Pelias accuracy: "point" (a specific address/building) or "centroid"
   * (the geocoder only matched a larger area -- a street, a town -- and
   * picked its midpoint). Null if not supplied. */
  accuracy: "point" | "centroid" | null;
  /** Pelias match type: "exact" | "interpolated" (estimated along a street
   * from numbered endpoints) | "fallback" (matched something broader than
   * what was asked for, e.g. a street with no civic number). Null if not
   * supplied. */
  matchType: "exact" | "interpolated" | "fallback" | null;
  /** City/town the provider matched (locality, else local admin area).
   * Used to catch a match that landed in a different town than the one the
   * customer typed (e.g. "60 St" in Beaumont instead of Camrose). */
  locality: string | null;
};

/**
 * A geocode that's risky to price/route from without the customer
 * double-checking it -- e.g. "Township Road 444" with no house number,
 * which Pelias can only match to some point along (or the midpoint of) the
 * road rather than the actual destination. This is NOT a validation
 * failure (the address isn't rejected) -- callers should surface the
 * resolved address back to the customer for confirmation and encourage
 * them to add a civic number/more detail when this is true, per the
 * decision to solve ambiguous-address accuracy with confirmation + better
 * input rather than by swapping routing providers.
 */
export function isLowConfidenceGeocode(geocode: GeocodeResult): boolean {
  return (
    geocode.accuracy === "centroid" ||
    geocode.matchType === "fallback" ||
    (geocode.confidence !== null && geocode.confidence < 0.8) ||
    (geocode.confidence === null && geocode.accuracy === null && geocode.matchType === null)
  );
}

/** True if the street line starts with a civic (house) number, allowing an
 * optional unit prefix ("Unit 4, 123 Main St", "#4 - 123 Main St"). A rural
 * road like "Township Road 444" has no leading civic number. */
export function hasCivicNumber(street: string): boolean {
  return /^\s*(?:(?:unit|apt|apartment|suite|#)\s*\w+[\s,-]+)?\d+[a-z]?(?:\s|-)\S/i.test(street);
}

function normalizePlace(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Customer-facing assessment of a geocode, given what they actually typed.
 *  - lowConfidence: worth warning about and asking them to fix -- the match
 *    is in a different town than typed, or they gave NO house number and we
 *    could only match a street/area.
 *  - approximate: they DID give a house number, but the map data we use has
 *    no point for that exact house, so the match (and distance pricing)
 *    falls back to the street. That's a map-data gap, not a typo -- telling
 *    them to "add a house number" is wrong; the written address is still
 *    what the driver uses. Shown as a soft note instead.
 */
export function assessGeocode(
  geocode: GeocodeResult,
  typed: { street: string; city: string }
): { lowConfidence: boolean; approximate: boolean } {
  const typedCity = normalizePlace(typed.city);
  const matchedCity = geocode.locality ? normalizePlace(geocode.locality) : "";
  const cityMismatch =
    typedCity !== "" &&
    matchedCity !== "" &&
    !matchedCity.includes(typedCity) &&
    !typedCity.includes(matchedCity);
  if (cityMismatch) return { lowConfidence: true, approximate: false };

  const streetLevelOnly =
    geocode.accuracy === "centroid" || geocode.matchType === "fallback";

  if (hasCivicNumber(typed.street)) {
    return { lowConfidence: false, approximate: streetLevelOnly };
  }
  return { lowConfidence: isLowConfidenceGeocode(geocode), approximate: false };
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

const ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const ORS_STRUCTURED_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search/structured";
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

// Patch 5: every call to the routing provider goes through this, instead
// of a bare `fetch`. Without an explicit timeout, a `fetch()` call that
// never gets a response (the provider stalls, a network hiccup drops the
// connection without an error) just hangs -- there's no automatic cutoff.
// On Vercel, that silently runs out the clock on the serverless function's
// own execution-time limit, which kills the request with NO application-
// level error logged (nothing for `catch` to catch, nothing for
// console.error to report) -- exactly the "stuck on 'Checking
// availability...' with nothing in the logs" symptom. Aborting after a
// fixed timeout turns that into an ordinary, visible RoutingError instead.
const ORS_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORS_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Shared feature -> GeocodeResult parsing, used by both the free-text and
 * structured geocode functions below -- the ORS/Pelias response shape
 * (geometry.coordinates + properties.*) is identical either way, only the
 * request differs. `fallbackLabel` is used as `formatted` if the provider
 * doesn't return a `label` property.
 */
function parseGeocodeFeature(
  feature: any,
  fallbackLabel: string,
  notFoundMessage: string
): GeocodeResult {
  if (!feature) {
    throw new RoutingError(notFoundMessage);
  }

  const coords = feature.geometry?.coordinates;
  const lng = coords?.[0];
  const lat = coords?.[1];
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new RoutingError("That address could not be resolved to a location.");
  }

  const props = feature.properties ?? {};

  const confidence = typeof props.confidence === "number" ? props.confidence : null;
  const accuracy =
    props.accuracy === "point" || props.accuracy === "centroid" ? props.accuracy : null;
  const matchType =
    props.match_type === "exact" || props.match_type === "interpolated" || props.match_type === "fallback"
      ? props.match_type
      : null;

  return {
    lat,
    lng,
    formatted: typeof props.label === "string" ? props.label : fallbackLabel,
    regionCode: typeof props.region_a === "string" ? props.region_a : null,
    regionName: typeof props.region === "string" ? props.region : null,
    confidence,
    accuracy,
    matchType,
    locality:
      typeof props.locality === "string"
        ? props.locality
        : typeof props.localadmin === "string"
          ? props.localadmin
          : null,
  };
}

async function fetchOrsGeocode(url: string): Promise<any> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RoutingError(
        "The routing service is taking too long to respond. Please try again in a moment."
      );
    }
    throw new RoutingError(
      "Could not reach the routing service to verify this address. Please try again."
    );
  }

  if (!response.ok) {
    throw new RoutingError(
      `The routing service could not process this address (status ${response.status}).`
    );
  }

  return response.json();
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

  const data = await fetchOrsGeocode(url);
  return parseGeocodeFeature(
    data?.features?.[0],
    trimmed,
    "That address could not be found. Please check it and try again."
  );
}

export type StructuredAddressInput = {
  /** House number + street, e.g. "5303 60 St". */
  address: string;
  locality?: string;
  region?: string;
  postalcode?: string;
  country?: string;
  /** Bias results toward this point (the business origin). With a street
   * name as common as "60 St", this is what makes the nearby town win over
   * identically-named streets in other Alberta towns. */
  focus?: { lat: number; lng: number };
};

/**
 * Geocodes an address given as discrete fields (house number/street,
 * city, province, postal code, country) via ORS's *structured* geocoding
 * endpoint, instead of concatenating everything into one free-text string.
 *
 * Free-text geocoding runs the whole string through Pelias's natural-
 * language parser, which -- especially against sparse rural-Alberta data --
 * can mis-split a precise "5303 60 St, Camrose, AB" into just "60 St" and
 * drop the house number and/or city entirely, producing a low-confidence,
 * wrong, or overly broad match even though the customer typed everything
 * correctly. Sending each field in its own parameter skips that parsing
 * step, so a precise civic number is far less likely to get lost. Throws
 * RoutingError -- never returns a guessed location -- if the address can't
 * be resolved or the API call fails for any reason.
 */
export async function geocodeAddressStructured(
  input: StructuredAddressInput
): Promise<GeocodeResult> {
  const address = input.address.trim();
  if (!address) {
    throw new RoutingError("An address is required.");
  }

  const params = new URLSearchParams({
    api_key: getOrsApiKey(),
    address,
    size: "1",
  });
  if (input.locality?.trim()) params.set("locality", input.locality.trim());
  if (input.region?.trim()) params.set("region", input.region.trim());
  if (input.postalcode?.trim()) params.set("postalcode", input.postalcode.trim());
  if (input.country?.trim()) params.set("country", input.country.trim());
  params.set("boundary.country", "CA");
  if (input.focus) {
    params.set("focus.point.lat", String(input.focus.lat));
    params.set("focus.point.lon", String(input.focus.lng));
  }

  const url = `${ORS_STRUCTURED_GEOCODE_URL}?${params.toString()}`;
  const fallbackLabel = [address, input.locality, input.region, input.postalcode, input.country]
    .filter(Boolean)
    .join(", ");

  const data = await fetchOrsGeocode(url);
  return parseGeocodeFeature(
    data?.features?.[0],
    fallbackLabel,
    "That address could not be found. Please check it and try again."
  );
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
    response = await fetchWithTimeout(url);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RoutingError(
        "The routing service is taking too long to respond. Please try again in a moment."
      );
    }
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

/**
 * Same as geocodeAndValidateServiceArea, but using the structured geocoding
 * endpoint (see geocodeAddressStructured) -- the preferred path for any
 * caller that already has the address broken into discrete fields (street/
 * city/province/postal code), e.g. the public booking form.
 */
export async function geocodeAndValidateServiceAreaStructured(
  input: StructuredAddressInput,
  serviceAreaProvinceCode: string
): Promise<GeocodeResult> {
  const geocode = await geocodeAddressStructured(input);
  if (!isWithinServiceArea(geocode, serviceAreaProvinceCode)) {
    throw new RoutingError(
      "That address is outside our current service area. Please double-check the address, or contact us if you believe this is an error."
    );
  }
  return geocode;
}
