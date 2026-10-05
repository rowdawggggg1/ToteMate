import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings, packages } from "@/lib/db/schema";
import { buildPublicThemeStyle } from "@/lib/theme";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const { package: packageId } = await searchParams;
  const db = getDb();

  const settingsRows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const settings = settingsRows[0];

  let packageName: string | null = null;
  if (packageId) {
    const rows = await db
      .select({ name: packages.name })
      .from(packages)
      .where(eq(packages.id, packageId))
      .limit(1);
    packageName = rows[0]?.name ?? null;
  }

  const businessName = settings?.businessName ?? "ToteMate";
  const themeStyle = buildPublicThemeStyle(settings);

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
      <main className="flex flex-1 items-center justify-center px-4 py-20 text-center">
        <div className="max-w-md">
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">
            Booking is almost here
          </h1>
          <p className="mt-3 text-[var(--color-muted)]">
            {packageName
              ? `Online booking for the ${packageName} package isn't open quite yet.`
              : "Online booking isn't open quite yet."}{" "}
            In the meantime, reach out and we'll get you set up directly.
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
