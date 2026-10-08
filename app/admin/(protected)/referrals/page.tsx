import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings, orders, referralCodes, referralRedemptions } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { ReferralSettingsForm } from "./settings-form";
import { markReferralPayoutPaidAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const db = getDb();

  const settingsRows = await db.select().from(businessSettings).where(eq(businessSettings.id, 1)).limit(1);
  const settings = settingsRows[0];

  const redemptionRows = await db
    .select({
      id: referralRedemptions.id,
      refereeDiscountCents: referralRedemptions.refereeDiscountCents,
      referrerRewardCents: referralRedemptions.referrerRewardCents,
      payoutStatus: referralRedemptions.payoutStatus,
      paidAt: referralRedemptions.paidAt,
      createdAt: referralRedemptions.createdAt,
      code: referralCodes.code,
      ownerType: referralCodes.ownerType,
      ownerEmail: referralCodes.customerEmail,
      orderNumber: orders.orderNumber,
      orderId: orders.id,
    })
    .from(referralRedemptions)
    .innerJoin(referralCodes, eq(referralRedemptions.referralCodeId, referralCodes.id))
    .innerJoin(orders, eq(referralRedemptions.orderId, orders.id))
    .orderBy(desc(referralRedemptions.createdAt));

  const totalOwedCents = redemptionRows
    .filter((r) => r.payoutStatus === "owed")
    .reduce((sum, r) => sum + r.referrerRewardCents, 0);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Referral program</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Every customer and realtor has their own referral code, generated automatically the
          first time it's needed.
        </p>
      </div>

      {settings && (
        <ReferralSettingsForm
          initialValues={{
            referrerRewardType: settings.referralReferrerRewardType as "fixed" | "percentage",
            referrerRewardValue:
              settings.referralReferrerRewardType === "percentage"
                ? settings.referralReferrerRewardPercentage
                : centsToDollarsString(settings.referralReferrerRewardValueCents),
            refereeDiscountEnabled: settings.referralRefereeDiscountEnabled,
            refereeDiscountType: settings.referralRefereeDiscountType as "fixed" | "percentage",
            refereeDiscountValue:
              settings.referralRefereeDiscountType === "percentage"
                ? settings.referralRefereeDiscountPercentage
                : centsToDollarsString(settings.referralRefereeDiscountValueCents),
            realtorsEarnReferrerReward: settings.referralRealtorsEarnReferrerReward,
          }}
        />
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Redemptions</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Currently owed:{" "}
            <span className="font-medium text-[var(--color-text)]">
              ${centsToDollarsString(totalOwedCents)}
            </span>
          </p>
        </div>

        {redemptionRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No referral codes have been used yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {redemptionRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">
                    {r.code} ({r.ownerType}
                    {r.ownerEmail ? ` -- ${r.ownerEmail}` : ""}) -- order {r.orderNumber}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Referee discount: ${centsToDollarsString(r.refereeDiscountCents)} · Referrer owed: $
                    {centsToDollarsString(r.referrerRewardCents)} ·{" "}
                    {r.payoutStatus === "paid" ? "Paid" : "Owed"}
                  </p>
                </div>
                {r.payoutStatus === "owed" && r.referrerRewardCents > 0 && (
                  <form action={markReferralPayoutPaidAction.bind(null, r.id)}>
                    <SubmitButton pendingText="Marking…">Mark Paid</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
