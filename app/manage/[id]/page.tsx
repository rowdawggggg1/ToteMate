import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings, orders } from "@/lib/db/schema";
import { buildPublicThemeStyle } from "@/lib/theme";
import { hashManageToken } from "@/lib/manage-token";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { ManageBookingClient } from "./manage-booking-client";

export const dynamic = "force-dynamic";

const MANAGEABLE_STATUSES = ["scheduled"];

export default async function ManageBookingPage({
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

  const isValid = !!order && !!token && !!order.manageTokenHash && hashManageToken(token) === order.manageTokenHash;

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
              This booking link is invalid or has expired. If you need help with your booking,
              please contact us directly.
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
        ) : (
          <ManageBookingClient
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              packageName: order.packageName,
              confirmedDeliveryDate: order.confirmedDeliveryDate,
              confirmedPickupDate: order.confirmedPickupDate,
              finalAmountCents: order.finalAmountCents,
              currency: order.currency,
              paymentStatus: order.paymentStatus,
            }}
            token={token as string}
            canManage={MANAGEABLE_STATUSES.includes(order.status)}
            minLeadTimeDays={settings?.minLeadTimeDays ?? 2}
          />
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
