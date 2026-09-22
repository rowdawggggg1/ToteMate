import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/admin";
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
  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
