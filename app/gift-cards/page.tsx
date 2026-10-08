import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { buildPublicThemeStyle } from "@/lib/theme";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { listActiveDenominations } from "@/lib/giftcards";
import { GiftCardPurchaseForm } from "./purchase-form";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const { purchased } = await searchParams;
  const db = getDb();
  const settingsRows = await db.select().from(businessSettings).where(eq(businessSettings.id, 1)).limit(1);
  const settings = settingsRows[0];
  const businessName = settings?.businessName ?? "ToteMate";
  const themeStyle = buildPublicThemeStyle(settings);

  const denominations = await listActiveDenominations();

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
        <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">Gift Cards</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Give the gift of a stress-free move. Gift cards are delivered as a redeemable code and
          never expire.
        </p>

        {purchased === "1" && (
          <p className="mt-4 rounded-lg bg-[var(--color-success)]/15 p-3 text-sm text-[var(--color-success)]">
            Thanks! Your gift card is on its way -- check your email for the code.
          </p>
        )}

        <div className="mt-8">
          {denominations.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Gift cards aren't available for purchase right now. Please check back soon.
            </p>
          ) : (
            <GiftCardPurchaseForm denominations={denominations} />
          )}
        </div>
      </main>
      <SiteFooter
        businessName={businessName}
        contactEmail={settings?.contactEmail ?? null}
        contactPhone={settings?.contactPhone ?? null}
        serviceArea={settings?.serviceArea ?? null}
      />
    </div>
  );
}
