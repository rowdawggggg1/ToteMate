import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addOns, businessSettings, rentalAgreementVersions } from "@/lib/db/schema";
import { getActivePackages } from "@/lib/catalog";
import { buildPublicThemeStyle } from "@/lib/theme";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { BookingWizard } from "./booking-wizard";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const { package: preselectedPackageId } = await searchParams;
  const db = getDb();

  const settingsRows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const settings = settingsRows[0];

  const businessName = settings?.businessName ?? "ToteMate";
  const themeStyle = buildPublicThemeStyle(settings);

  if (!settings || settings.bookingPaused) {
    return (
      <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
        <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
        <main className="flex flex-1 items-center justify-center px-4 py-20 text-center">
          <div className="max-w-md">
            <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">
              Booking is temporarily paused
            </h1>
            <p className="mt-3 text-[var(--color-muted)]">
              We're not taking new online bookings right now. In the meantime, reach out and
              we'll get you set up directly.
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

  const [activePackages, activeAddOns, activeAgreementRows] = await Promise.all([
    getActivePackages(),
    db
      .select()
      .from(addOns)
      .where(eq(addOns.isActive, true))
      .orderBy(asc(addOns.displayOrder), asc(addOns.name)),
    db
      .select()
      .from(rentalAgreementVersions)
      .where(eq(rentalAgreementVersions.status, "active"))
      .limit(1),
  ]);
  const activeAgreement = activeAgreementRows[0] ?? null;

  if (activePackages.length === 0 || !activeAgreement) {
    return (
      <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
        <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
        <main className="flex flex-1 items-center justify-center px-4 py-20 text-center">
          <div className="max-w-md">
            <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">
              Booking isn't quite ready yet
            </h1>
            <p className="mt-3 text-[var(--color-muted)]">
              Please check back soon, or reach out and we'll get you set up directly.
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

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
      <main className="flex-1 px-4 py-10 sm:py-16">
        <BookingWizard
          businessName={businessName}
          currency={settings.currency}
          minLeadTimeDays={settings.minLeadTimeDays}
          preselectedPackageId={preselectedPackageId ?? null}
          packages={activePackages.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            toteQuantity: p.toteQuantity,
            priceCents: p.priceCents,
            rentalDurationWeeks: p.rentalDurationWeeks,
            includesDolly: p.includesDolly,
            photoUrl: p.photoUrl,
          }))}
          addOns={activeAddOns.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            priceCents: a.priceCents,
            packageId: a.packageId,
            isWeeklyExtension: a.isWeeklyExtension,
          }))}
          agreement={{
            id: activeAgreement.id,
            versionLabel: activeAgreement.versionLabel,
            content: activeAgreement.content,
          }}
          stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
        />
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
