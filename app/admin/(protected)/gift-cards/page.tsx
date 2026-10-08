import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftCardDenominations, giftCards } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { IssueGiftCardForm, AddDenominationForm } from "./issue-form";
import { toggleDenominationAction, disableGiftCardAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  admin_issued: "Admin issued",
  purchased: "Purchased",
  realtor_subscription: "Realtor subscription",
};

export default async function GiftCardsPage() {
  const db = getDb();
  const denominations = await db
    .select()
    .from(giftCardDenominations)
    .orderBy(giftCardDenominations.displayOrder, giftCardDenominations.amountCents);
  const cards = await db.select().from(giftCards).orderBy(desc(giftCards.createdAt)).limit(200);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Gift cards</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Issue a gift card directly, manage the purchasable amounts customers and realtors see,
          and track every card's balance.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Issue a gift card</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Free, admin-issued -- creates a redeemable code immediately.
        </p>
        <div className="mt-3">
          <IssueGiftCardForm />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-medium text-[var(--color-text)]">Purchasable amounts</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          The fixed denominations customers and realtors can buy on the public gift card page.
        </p>
        <ul className="mt-3 space-y-2">
          {denominations.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-2 text-sm">
              <span className="text-[var(--color-text)]">${centsToDollarsString(d.amountCents)}</span>
              <form action={toggleDenominationAction.bind(null, d.id, !d.isActive)}>
                <SubmitButton pendingText="…">{d.isActive ? "Disable" : "Enable"}</SubmitButton>
              </form>
            </li>
          ))}
          {denominations.length === 0 && (
            <p className="text-sm text-[var(--color-muted)]">No denominations yet -- add one below.</p>
          )}
        </ul>
        <div className="mt-3">
          <AddDenominationForm />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">All gift cards</h2>
        {cards.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No gift cards yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">
                    {c.code} -- ${centsToDollarsString(c.balanceCents)} / $
                    {centsToDollarsString(c.initialValueCents)} remaining
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {SOURCE_LABELS[c.sourceType] ?? c.sourceType} · {c.status}
                    {c.recipientEmail ? ` · for ${c.recipientEmail}` : ""}
                    {c.purchasedByEmail ? ` · bought by ${c.purchasedByEmail}` : ""}
                  </p>
                </div>
                {c.status === "active" && (
                  <form action={disableGiftCardAction.bind(null, c.id)}>
                    <SubmitButton pendingText="…">Disable</SubmitButton>
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
