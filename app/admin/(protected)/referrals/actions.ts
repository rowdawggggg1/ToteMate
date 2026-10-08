"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businessSettings, referralRedemptions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";

export type ReferralSettingsActionState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

const settingsSchema = z.object({
  referrerRewardType: z.enum(["fixed", "percentage"]),
  referrerRewardValue: z.coerce.number().min(0),
  refereeDiscountEnabled: z.coerce.boolean(),
  refereeDiscountType: z.enum(["fixed", "percentage"]),
  refereeDiscountValue: z.coerce.number().min(0),
  realtorsEarnReferrerReward: z.coerce.boolean(),
});

export async function updateReferralSettingsAction(
  _prevState: ReferralSettingsActionState,
  formData: FormData
): Promise<ReferralSettingsActionState> {
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse({
    referrerRewardType: formData.get("referrerRewardType"),
    referrerRewardValue: formData.get("referrerRewardValue"),
    refereeDiscountEnabled: formData.get("refereeDiscountEnabled"),
    refereeDiscountType: formData.get("refereeDiscountType"),
    refereeDiscountValue: formData.get("refereeDiscountValue"),
    realtorsEarnReferrerReward: formData.get("realtorsEarnReferrerReward"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const data = parsed.data;
  const db = getDb();

  const nextValues = {
    referralReferrerRewardType: data.referrerRewardType,
    referralReferrerRewardValueCents:
      data.referrerRewardType === "fixed" ? dollarsToCents(data.referrerRewardValue) : 0,
    referralReferrerRewardPercentage:
      data.referrerRewardType === "percentage" ? data.referrerRewardValue.toFixed(2) : "0",
    referralRefereeDiscountEnabled: data.refereeDiscountEnabled,
    referralRefereeDiscountType: data.refereeDiscountType,
    referralRefereeDiscountValueCents:
      data.refereeDiscountType === "fixed" ? dollarsToCents(data.refereeDiscountValue) : 0,
    referralRefereeDiscountPercentage:
      data.refereeDiscountType === "percentage" ? data.refereeDiscountValue.toFixed(2) : "0",
    referralRealtorsEarnReferrerReward: data.realtorsEarnReferrerReward,
    updatedAt: new Date(),
  };

  await db
    .insert(businessSettings)
    .values({ id: 1, ...nextValues })
    .onConflictDoUpdate({ target: businessSettings.id, set: nextValues });

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REFERRAL_SETTINGS_UPDATED",
    entityType: "business_settings",
    entityId: "1",
    after: nextValues,
  });

  revalidatePath("/admin/referrals");
  return { success: true };
}

/** Marks one referral redemption's owed reward as paid out (manually, outside the app). */
export async function markReferralPayoutPaidAction(
  redemptionId: string,
  _formData: FormData
): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  await db
    .update(referralRedemptions)
    .set({ payoutStatus: "paid", paidAt: new Date() })
    .where(eq(referralRedemptions.id, redemptionId));

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "REFERRAL_REWARD_MARKED_PAID",
    entityType: "referral_redemption",
    entityId: redemptionId,
  });

  revalidatePath("/admin/referrals");
}
