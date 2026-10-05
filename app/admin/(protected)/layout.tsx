import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { buildPublicThemeStyle } from "@/lib/theme";
import { AdminShell } from "@/components/admin/admin-shell";

// Everything behind this layout reads the session cookie and queries the
// database. Being explicit here (rather than relying on Next.js to infer
// it from cookies() usage) keeps this whole route group safely dynamic.
export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  // Same brand colors as the public site (Business Settings -> Branding),
  // so changing them re-skins the admin panel too, not just what
  // customers see.
  const db = getDb();
  const rows = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const themeStyle = buildPublicThemeStyle(rows[0]);

  return (
    <div style={themeStyle}>
      <AdminShell adminEmail={admin.email}>{children}</AdminShell>
    </div>
  );
}
