/**
 * Referral code business logic (Phase 5). Two independent halves, both
 * locked decisions:
 *
 *  - Referrer reward: whoever owns the code gets a %/$ amount whenever it
 *    is used, full stop -- not toggleable, and NOT store credit (the
 *    owner explicitly rejected that, since a referrer may never rent
 *    again). It's recorded as "owed" on a referralRedemptions row and
 *    paid out manually (e-transfer, cash, etc.); an admin marks it paid.
 *  - Referee discount: a toggle. When on, the new customer also gets a
 *    %/$ discount on their own order. Independent amount/type from the
 *    referrer reward.
 *
 * Realtor-owned codes use the exact same mechanism, except the referrer
 * side is gated by a second toggle (referralRealtorsEarnReferrerReward),
 * defaulted off -- realtors already profit via subscriptions/gift card
 * resale, so their code is a pure client perk until the owner decides
 * otherwise.
 */

import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { referralCodes, referralRedemptions, type businessSettings } from "@/lib/db/schema";

type BusinessSettingsRow = typeof businessSettings.$inferSelect;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

function generateCodeString(length = 7): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Creates a unique referral code row, retrying on the (very unlikely) collision. */
async function createUniqueReferralCode(
  owner: { ownerType: "customer"; customerEmail: string } | { ownerType: "realtor"; realtorId: string }
): Promise<typeof referralCodes.$inferSelect> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCodeString();
    try {
      const inserted = await db
        .insert(referralCodes)
        .values({
          code,
          ownerType: owner.ownerType,
          customerEmail: owner.ownerType === "customer" ? owner.customerEmail : null,
          realtorId: owner.ownerType === "realtor" ? owner.realtorId : null,
        })
        .returning();
      if (inserted[0]) return inserted[0];
    } catch {
      // Unique collision on `code` -- try again with a new random code.
    }
  }
  throw new Error("Could not generate a unique referral code. Please try again.");
}

/**
 * Returns a customer's existing referral code, creating one the first
 * time it's needed (lazily -- most customers will never look at theirs,
 * so there's no reason to generate one for every booking up front).
 */
export async function getOrCreateCustomerReferralCode(
  customerEmail: string
): Promise<typeof referralCodes.$inferSelect> {
  const db = getDb();
  const normalizedEmail = customerEmail.trim().toLowerCase();
  const existing = await db
    .select()
    .from(referralCodes)
    .where(and(eq(referralCodes.ownerType, "customer"), eq(referralCodes.customerEmail, normalizedEmail)))
    .limit(1);
  if (existing[0]) return existing[0];
  return createUniqueReferralCode({ ownerType: "customer", customerEmail: normalizedEmail });
}

/** Returns a realtor's existing referral code, creating one if this is their first login. */
export async function getOrCreateRealtorReferralCode(
  realtorId: string
): Promise<typeof referralCodes.$inferSelect> {
  const db = getDb();
  const existing = await db
    .select()
    .from(referralCodes)
    .where(and(eq(referralCodes.ownerType, "realtor"), eq(referralCodes.realtorId, realtorId)))
    .limit(1);
  if (existing[0]) return existing[0];
  return createUniqueReferralCode({ ownerType: "realtor", realtorId });
}

export type ReferralCodeLookup =
  | { ok: true; referralCode: typeof referralCodes.$inferSelect }
  | { ok: false; error: string };

/** Looks up an active referral code by its code string (case-insensitive), for use at checkout. */
export async function findActiveReferralCode(rawCode: string): Promise<ReferralCodeLookup> {
  const db = getDb();
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a referral code." };
  const rows = await db.select().from(referralCodes).where(eq(referralCodes.code, code)).limit(1);
  const referralCode = rows[0];
  if (!referralCode || !referralCode.isActive) {
    return { ok: false, error: "That referral code isn't valid." };
  }
  return { ok: true, referralCode };
}

/** A referrer can't redeem their own code on their own order. */
export function isSelfReferral(
  referralCode: typeof referralCodes.$inferSelect,
  customerEmail: string
): boolean {
  return (
    referralCode.ownerType === "customer" &&
    referralCode.customerEmail?.toLowerCase() === customerEmail.trim().toLowerCase()
  );
}

export type ReferralAmounts = {
  refereeDiscountCents: number;
  referrerRewardCents: number;
};

/**
 * Computes both halves from current settings, given the referee's order
 * total (before this discount is subtracted) and which kind of code it
 * is. Pure function -- settings and the code are both already looked up
 * by the caller.
 */
export function calculateReferralAmounts(
  settings: BusinessSettingsRow,
  referralCode: typeof referralCodes.$inferSelect,
  orderSubtotalCents: number
): ReferralAmounts {
  const refereeDiscountCents = settings.referralRefereeDiscountEnabled
    ? settings.referralRefereeDiscountType === "percentage"
      ? Math.round((orderSubtotalCents * Number(settings.referralRefereeDiscountPercentage)) / 100)
      : settings.referralRefereeDiscountValueCents
    : 0;

  const referrerEarns = referralCode.ownerType === "realtor" ? settings.referralRealtorsEarnReferrerReward : true;
  const referrerRewardCents = referrerEarns
    ? settings.referralReferrerRewardType === "percentage"
      ? Math.round((orderSubtotalCents * Number(settings.referralReferrerRewardPercentage)) / 100)
      : settings.referralReferrerRewardValueCents
    : 0;

  return { refereeDiscountCents, referrerRewardCents };
}

/** Records a redemption once the referee's order has actually been created. */
export async function recordReferralRedemption(params: {
  referralCodeId: string;
  orderId: string;
  refereeDiscountCents: number;
  referrerRewardCents: number;
}): Promise<void> {
  const db = getDb();
  await db.insert(referralRedemptions).values({
    referralCodeId: params.referralCodeId,
    orderId: params.orderId,
    refereeDiscountCents: params.refereeDiscountCents,
    referrerRewardCents: params.referrerRewardCents,
  });
}
