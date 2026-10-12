import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings, orders } from "@/lib/db/schema";
import { buildPublicThemeStyle } from "@/lib/theme";
import { hashManageToken } from "@/lib/manage-token";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { ReviewFormClient } from "./review-form-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const db = getDb();
  const settingsRows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const settings = settingsRows[0];
  const businessName = settings?.businessName ?? "ToteMate";
  const themeStyle = buildPublicThemeStyle(settings);

  const orderRows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = orderRows[0];

  const isValid = !!order && !!token && !!order.reviewTokenHash && hashManageToken(token) === order.reviewTokenHash;
  const alreadySubmitted = !!order?.reviewSubmittedAt;

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
      <main className="flex-1 px-4 py-10 sm:py-16">
        {!isValid || !order ? (
          <div className="mx-auto max-w-md text-center">
            <h1 className="font-serif text-2xl font-semibold text-[var(--color-text)]">
              Link not recognized
            </h1>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              This review link is invalid or has expired. If you&apos;d still like to leave a
              review, please contact us directly.
            </p>
            {settings?.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="mt-6 inline-block rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white"
              >
                Contact Us
              </a>
            )}
          </div>
        ) : alreadySubmitted ? (
          <div className="mx-auto max-w-md text-center">
            <h1 className="font-serif text-2xl font-semibold text-[var(--color-text)]">
              Already submitted
            </h1>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              You&apos;ve already left a review for this order. Thanks again!
            </p>
          </div>
        ) : (
          <ReviewFormClient orderId={order.id} token={token as string} packageName={order.packageName} />
        )}
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
