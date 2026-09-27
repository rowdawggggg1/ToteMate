import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader businessName={businessName} />
      <main className="flex flex-1 items-center justify-center px-4 py-20 text-center">
        <div className="max-w-md">
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text)]">
            Realtor Program
          </h1>
          <p className="mt-3 text-[var(--color-muted)]">
            The Realtor portal -- gift certificates for your clients and more -- is
            launching soon. If you're a realtor interested in partnering with{" "}
            {businessName}, get in touch.
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
