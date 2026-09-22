"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";

/** Converts "" (or missing) to undefined before the number coercion runs,
 * so an empty optional field means "not set" rather than 0. */
const optionalNonNegInt = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  return val;
}, z.coerce.number().int().min(0).optional());

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
  logoUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")).default(""),

  minLeadTimeDays: z.coerce.number().int().min(0),
  deliveryFreeRadiusKm: z.coerce.number().min(0),
  pickupFreeRadiusKm: z.coerce.number().min(0),
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
    logoUrl: formData.get("logoUrl"),
    minLeadTimeDays: formData.get("minLeadTimeDays"),
    deliveryFreeRadiusKm: formData.get("deliveryFreeRadiusKm"),
    pickupFreeRadiusKm: formData.get("pickupFreeRadiusKm"),
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
    logoUrl: data.logoUrl || null,
    minLeadTimeDays: data.minLeadTimeDays,
    deliveryFreeRadiusKm: data.deliveryFreeRadiusKm.toFixed(2),
    pickupFreeRadiusKm: data.pickupFreeRadiusKm.toFixed(2),
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
