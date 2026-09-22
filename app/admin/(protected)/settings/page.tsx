import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { SettingsForm, type SettingsInitialValues } from "./settings-form";

export default async function AdminSettingsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);

  const s = rows[0];

  const initialValues: SettingsInitialValues = {
    businessName: s?.businessName ?? "ToteMate",
    tagline: s?.tagline ?? "",
    contactEmail: s?.contactEmail ?? "",
    contactPhone: s?.contactPhone ?? "",
    businessAddress: s?.businessAddress ?? "",
    currency: s?.currency ?? "CAD",
    distanceUnit: s?.distanceUnit ?? "km",
    timezone: s?.timezone ?? "America/Edmonton",
    serviceArea: s?.serviceArea ?? "",
    logoUrl: s?.logoUrl ?? "",
    minLeadTimeDays: s?.minLeadTimeDays ?? 2,
    deliveryFreeRadiusKm: s?.deliveryFreeRadiusKm ?? "0.00",
    pickupFreeRadiusKm: s?.pickupFreeRadiusKm ?? "0.00",
    deliveryRatePerKm: s ? centsToDollarsString(s.deliveryRateCentsPerKm) : "0.00",
    pickupRatePerKm: s ? centsToDollarsString(s.pickupRateCentsPerKm) : "0.00",
    readinessBufferDays: s?.readinessBufferDays ?? 1,
    dailyCapacityEnabled: s?.dailyCapacityEnabled ?? false,
    maxDeliveriesPerDay: s?.maxDeliveriesPerDay ?? "",
    maxPickupsPerDay: s?.maxPickupsPerDay ?? "",
    maxCombinedJobsPerDay: s?.maxCombinedJobsPerDay ?? "",
    overbookingEnabled: s?.overbookingEnabled ?? false,
    cancellationFeeType: (s?.cancellationFeeType as "fixed" | "percentage") ?? "fixed",
    cancellationFeeAmount: s
      ? centsToDollarsString(s.cancellationFeeAmountCents)
      : "0.00",
    cancellationFeePercentage: s?.cancellationFeePercentage ?? "0.00",
    lateFeePerToteDay: s ? centsToDollarsString(s.lateFeeCentsPerToteDay) : "0.00",
    damagedToteFee: s ? centsToDollarsString(s.damagedToteFeeCents) : "0.00",
    lostToteFee: s ? centsToDollarsString(s.lostToteFeeCents) : "0.00",
    bookingPaused: s?.bookingPaused ?? false,
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">
        Business Settings
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        These settings control pricing, scheduling, and booking rules across
        ToteMate. Changing them here never rewrites past orders once those exist.
      </p>
      <SettingsForm initialValues={initialValues} />
    </div>
  );
}
