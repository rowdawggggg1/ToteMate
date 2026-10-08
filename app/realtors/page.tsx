import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { buildPublicThemeStyle } from "@/lib/theme";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

export const dynamic = "force-dynamic";

export default async function RealtorsPage() {
  const db = getDb();
  const settingsRows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const settings = settingsRows[0];
  const businessName = settings?.businessName ?? "ToteMate";
  const themeStyle = buildPublicThemeStyle(settings);

  return (
    <div style={themeStyle} className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <SiteHeader businessName={businessName} logoUrl={settings?.logoUrl} />
      <main className="flex flex-1 items-center justify-center px-4 py-20 text-center">
        <div className="max-w-md">
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">
            Realtor Program
          </h1>
          <p className="mt-3 text-[var(--color-muted)]">
            Give your clients a referral code, send them a discounted gift card through a
            subscription, or buy one ad-hoc. Interested in partnering with {businessName}? Get in
            touch, and once we've set up your account you can sign in below.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="/realtor/login"
              className="inline-block rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white"
            >
              Realtor Sign In
            </a>
            {settings?.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="inline-block rounded-lg border border-[var(--color-border)] px-6 py-3 text-sm font-medium text-[var(--color-text)]"
              >
                Contact Us
              </a>
            )}
          </div>
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
