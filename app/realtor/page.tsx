import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  businessSettings,
  giftCards,
  realtorSubscriptionTiers,
  realtorSubscriptions,
} from "@/lib/db/schema";
import { requireRealtor } from "@/lib/auth/admin";
import { getOrCreateRealtorReferralCode } from "@/lib/referrals";
import { centsToDollarsString } from "@/lib/money";
import { SubscribeForm, CancelSubscriptionForm, GiftCardPurchaseForm } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function RealtorDashboardPage() {
  const realtor = await requireRealtor();
  const db = getDb();

  const [referralCode, settingsRows, subscriptionRows, tiers, myGiftCards] = await Promise.all([
    getOrCreateRealtorReferralCode(realtor.id),
    db.select().from(businessSettings).where(eq(businessSettings.id, 1)).limit(1),
    db.select().from(realtorSubscriptions).where(eq(realtorSubscriptions.realtorId, realtor.id)).limit(1),
    db
      .select()
      .from(realtorSubscriptionTiers)
      .where(eq(realtorSubscriptionTiers.isActive, true))
      .orderBy(realtorSubscriptionTiers.displayOrder),
    db
      .select()
      .from(giftCards)
      .where(eq(giftCards.issuedToRealtorId, realtor.id))
      .orderBy(desc(giftCards.createdAt))
      .limit(50),
  ]);

  const settings = settingsRows[0];
  const subscription = subscriptionRows[0] ?? null;
  const subscribedTier = subscription
    ? tiers.find((t) => t.id === subscription.tierId) ??
      (await db
        .select()
        .from(realtorSubscriptionTiers)
        .where(eq(realtorSubscriptionTiers.id, subscription.tierId))
        .limit(1))[0]
    : null;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Welcome, {realtor.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Share your referral code, manage your gift card subscription, or buy a gift card for a
          client.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Your referral code</h2>
        <p className="mt-2 font-mono text-lg text-[var(--color-text)]">{referralCode.code}</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Give this to clients when you book with {settings?.businessName ?? "us"} -- it applies
          automatically at checkout.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Gift card subscription</h2>
        {subscription && subscribedTier ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-[var(--color-text)]">
              {subscribedTier.name} -- ${centsToDollarsString(subscribedTier.priceCents)}/
              {subscribedTier.cadenceInterval} for a ${centsToDollarsString(subscribedTier.giftCardValueCents)} gift
              card
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Status: {subscription.status}
              {subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
              {subscription.currentPeriodEnd
                ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </p>
            {subscription.status === "active" && !subscription.cancelAtPeriodEnd && (
              <CancelSubscriptionForm />
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {tiers.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No subscription tiers are available yet.</p>
            ) : (
              tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{tier.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      ${centsToDollarsString(tier.priceCents)}/{tier.cadenceInterval} for a $
                      {centsToDollarsString(tier.giftCardValueCents)} gift card
                    </p>
                  </div>
                  <SubscribeForm tierId={tier.id} />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Buy a gift card</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Full price -- for when you want to send a client a gift without waiting on your next
          subscription cycle.
        </p>
        <div className="mt-3">
          <GiftCardPurchaseForm />
        </div>
      </div>

      {myGiftCards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Your gift cards</h2>
          <ul className="mt-3 space-y-2">
            {myGiftCards.map((c) => (
              <li key={c.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <p className="font-medium text-[var(--color-text)]">{c.code}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  ${centsToDollarsString(c.balanceCents)} / ${centsToDollarsString(c.initialValueCents)} remaining ·{" "}
                  {c.status}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
