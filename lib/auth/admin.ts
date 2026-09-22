import { redirect } from "next/navigation";
import { getSessionAdmin } from "./session";

/**
 * Call this from any protected Server Component or Server Action. It
 * redirects to /admin/login if there is no valid session, and otherwise
 * returns the authenticated admin record. This is the defense-in-depth
 * check that runs independently of proxy.ts's lightweight cookie check.
 */
export async function requireAdmin() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  return admin;
}

export async function getCurrentAdmin() {
  return getSessionAdmin();
}
