"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { geocodeAddress } from "@/lib/routing";

/** Converts "" (or missing) to undefined before the number coercion runs,
 * so an empty optional field means "not set" rather than 0. */
const optionalNonNegInt = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  return val;
}, z.coerce.number().int().min(0).optional());

/** Same idea as optionalNonNegInt, but for decimal fields (e.g. km). */
const optionalNonNegDecimal = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  return val;
}, z.coerce.number().min(0).optional());

/** Same "" -> undefined idea, for the optional manual lat/lng override. */
const optionalLatLng = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  return val;
}, z.coerce.number().min(-180).max(180).optional());

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a color as #rrggbb.");

const settingsSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required."),
  tagline: z.string().trim().optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .or(z.literal(""))
    .default(""),
  contactPhone: z.string().trim().optional().default(""),
  businessAddress: z.string().trim().optional().default(""),
  currency: z.string().trim().min(1),
  distanceUnit: z.enum(["km", "mi"]),
  timezone: z.string().trim().min(1),
  serviceArea: z.string().trim().optional().default(""),
  serviceAreaProvinceCode: z
    .string()
    .trim()
    .min(2, "Enter a two-letter province/region code.")
    .max(2, "Enter a two-letter province/region code.")
    .transform((v) => v.toUpperCase()),
  businessOriginLat: optionalLatLng,
  businessOriginLng: optionalLatLng,
  logoUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")).default(""),
  heroImageUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")).default(""),
  primaryColor: hexColor,
  accentColor: hexColor,
  backgroundColor: hexColor,

  minLeadTimeDays: z.coerce.number().int().min(0),
  deliveryFreeRadiusKm: z.coerce.number().min(0),
  pickupFreeRadiusKm: z.coerce.number().min(0),
  maxDeliveryRadiusKm: optionalNonNegDecimal,
  deliveryRatePerKm: z.coerce.number().min(0),
  pickupRatePerKm: z.coerce.number().min(0),
  readinessBufferDays: z.coerce.number().int().min(0),

  dailyCapacityEnabled: z.coerce.boolean(),
  maxDeliveriesPerDay: optionalNonNegInt,
  maxPickupsPerDay: optionalNonNegInt,
  maxCombinedJobsPerDay: optionalNonNegInt,

  overbookingEnabled: z.coerce.boolean(),

  cancellationFeeType: z.enum(["fixed", "percentage"]),
  cancellationFeeAmount: z.coerce.number().min(0),
  cancellationFeePercentage: z.coerce.number().min(0).max(100),
  cancellationWindowHours: z.coerce.number().int().min(0),
  cancellationCutoffReference: z.enum(["start_of_day", "end_of_day"]),

  lateFeePerToteDay: z.coerce.number().min(0),
  damagedToteFee: z.coerce.number().min(0),
  lostToteFee: z.coerce.number().min(0),

  bookingPaused: z.coerce.boolean(),
});

export type SettingsActionState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export async function updateSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  // Defense in depth: re-check authorization here even though the page
  // that renders this form is already behind the protected layout.
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse({
    businessName: formData.get("businessName"),
    tagline: formData.get("tagline"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    businessAddress: formData.get("businessAddress"),
    currency: formData.get("currency"),
    distanceUnit: formData.get("distanceUnit"),
    timezone: formData.get("timezone"),
    serviceArea: formData.get("serviceArea"),
    serviceAreaProvinceCode: formData.get("serviceAreaProvinceCode"),
    businessOriginLat: formData.get("businessOriginLat"),
    businessOriginLng: formData.get("businessOriginLng"),
    logoUrl: formData.get("logoUrl"),
    heroImageUrl: formData.get("heroImageUrl"),
    primaryColor: formData.get("primaryColor"),
    accentColor: formData.get("accentColor"),
    backgroundColor: formData.get("backgroundColor"),
    minLeadTimeDays: formData.get("minLeadTimeDays"),
    deliveryFreeRadiusKm: formData.get("deliveryFreeRadiusKm"),
    pickupFreeRadiusKm: formData.get("pickupFreeRadiusKm"),
    maxDeliveryRadiusKm: formData.get("maxDeliveryRadiusKm"),
    deliveryRatePerKm: formData.get("deliveryRatePerKm"),
    pickupRatePerKm: formData.get("pickupRatePerKm"),
    readinessBufferDays: formData.get("readinessBufferDays"),
    dailyCapacityEnabled: formData.get("dailyCapacityEnabled"),
    maxDeliveriesPerDay: formData.get("maxDeliveriesPerDay"),
    maxPickupsPerDay: formData.get("maxPickupsPerDay"),
    maxCombinedJobsPerDay: formData.get("maxCombinedJobsPerDay"),
    overbookingEnabled: formData.get("overbookingEnabled"),
    cancellationFeeType: formData.get("cancellationFeeType"),
    cancellationFeeAmount: formData.get("cancellationFeeAmount"),
    cancellationFeePercentage: formData.get("cancellationFeePercentage"),
    cancellationWindowHours: formData.get("cancellationWindowHours"),
    cancellationCutoffReference: formData.get("cancellationCutoffReference"),
    lateFeePerToteDay: formData.get("lateFeePerToteDay"),
    damagedToteFee: formData.get("damagedToteFee"),
    lostToteFee: formData.get("lostToteFee"),
    bookingPaused: formData.get("bookingPaused"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const data = parsed.data;
  const db = getDb();

  const existingRows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const existing = existingRows[0] ?? null;

  // Resolve the routing origin: a manual override always wins; otherwise,
  // if the business address changed, best-effort re-geocode it. A failure
  // here (no API key configured yet, address not found, network issue)
  // never blocks saving the rest of the settings -- it just leaves the
  // previous coordinates in place, and routing/pricing will surface a
  // clear error later if an origin is still missing when it's actually
  // needed.
  let resolvedOriginLat = existing?.businessOriginLat ?? null;
  let resolvedOriginLng = existing?.businessOriginLng ?? null;

  if (data.businessOriginLat !== undefined && data.businessOriginLng !== undefined) {
    resolvedOriginLat = data.businessOriginLat.toFixed(6);
    resolvedOriginLng = data.businessOriginLng.toFixed(6);
  } else if (data.businessAddress && data.businessAddress !== existing?.businessAddress) {
    try {
      const geocode = await geocodeAddress(data.businessAddress);
      resolvedOriginLat = geocode.lat.toFixed(6);
      resolvedOriginLng = geocode.lng.toFixed(6);
    } catch {
      // See comment above -- best effort only.
    }
  }

  const nextValues = {
    businessName: data.businessName,
    tagline: data.tagline || null,
    contactEmail: data.contactEmail || null,
    contactPhone: data.contactPhone || null,
    businessAddress: data.businessAddress || null,
    currency: data.currency,
    distanceUnit: data.distanceUnit,
    timezone: data.timezone,
    serviceArea: data.serviceArea || null,
    serviceAreaProvinceCode: data.serviceAreaProvinceCode,
    businessOriginLat: resolvedOriginLat,
    businessOriginLng: resolvedOriginLng,
    logoUrl: data.logoUrl || null,
    heroImageUrl: data.heroImageUrl || null,
    primaryColor: data.primaryColor,
    accentColor: data.accentColor,
    backgroundColor: data.backgroundColor,
    minLeadTimeDays: data.minLeadTimeDays,
    deliveryFreeRadiusKm: data.deliveryFreeRadiusKm.toFixed(2),
    pickupFreeRadiusKm: data.pickupFreeRadiusKm.toFixed(2),
    maxDeliveryRadiusKm:
      data.maxDeliveryRadiusKm === undefined ? null : data.maxDeliveryRadiusKm.toFixed(2),
    deliveryRateCentsPerKm: dollarsToCents(data.deliveryRatePerKm),
    pickupRateCentsPerKm: dollarsToCents(data.pickupRatePerKm),
    readinessBufferDays: data.readinessBufferDays,
    dailyCapacityEnabled: data.dailyCapacityEnabled,
    maxDeliveriesPerDay: data.maxDeliveriesPerDay ?? null,
    maxPickupsPerDay: data.maxPickupsPerDay ?? null,
    maxCombinedJobsPerDay: data.maxCombinedJobsPerDay ?? null,
    overbookingEnabled: data.overbookingEnabled,
    cancellationFeeType: data.cancellationFeeType,
    cancellationFeeAmountCents: dollarsToCents(data.cancellationFeeAmount),
    cancellationFeePercentage: data.cancellationFeePercentage.toFixed(2),
    cancellationWindowHours: data.cancellationWindowHours,
    cancellationCutoffReference: data.cancellationCutoffReference,
    lateFeeCentsPerToteDay: dollarsToCents(data.lateFeePerToteDay),
    damagedToteFeeCents: dollarsToCents(data.damagedToteFee),
    lostToteFeeCents: dollarsToCents(data.lostToteFee),
    bookingPaused: data.bookingPaused,
    updatedAt: new Date(),
  };

  await db
    .insert(businessSettings)
    .values({ id: 1, ...nextValues })
    .onConflictDoUpdate({
      target: businessSettings.id,
      set: nextValues,
    });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "BUSINESS_SETTINGS_UPDATED",
    entityType: "business_settings",
    entityId: "1",
    before: existing,
    after: nextValues,
  });

  revalidatePath("/admin/settings");

  return { success: true };
}
