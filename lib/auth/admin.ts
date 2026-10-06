import { redirect } from "next/navigation";
import { getSessionAdmin } from "./session";

/**
 * Call this from any protected Server Component or Server Action under
 * /admin. It redirects to /admin/login if there is no valid session, and
 * -- since drivers share the same admins table/session (see
 * lib/db/schema.ts's admins table comment) -- also redirects a driver
 * account away to /driver rather than letting it through: every admin
 * page and mutation action is owner-only by calling this. This is the
 * defense-in-depth check that runs independently of proxy.ts's
 * lightweight cookie check.
 */
export async function requireAdmin() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  if (admin.role !== "owner") {
    redirect("/driver");
  }
  return admin;
}

/**
 * Call this instead of requireAdmin() for the handful of things a driver
 * is also allowed to do (viewing /driver, marking an order delivered/
 * picked up) -- any active staff account, owner or driver, passes.
 */
export async function requireStaff() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  return admin;
}

export async function getCurrentAdmin() {
  return getSessionAdmin();
}
