import { redirect } from "next/navigation";
import { getSessionAdmin } from "./session";

/**
 * Call this from any protected Server Component or Server Action under
 * /admin. It redirects to /admin/login if there is no valid session, and
 * -- since drivers AND realtors share the same admins table/session (see
 * lib/db/schema.ts's admins table comment) -- also redirects a non-owner
 * account to its own front door rather than letting it through: every
 * admin page and mutation action is owner-only by calling this. This is
 * the defense-in-depth check that runs independently of proxy.ts's
 * lightweight cookie check.
 */
export async function requireAdmin() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  if (admin.role === "driver") {
    redirect("/driver");
  }
  if (admin.role === "realtor") {
    redirect("/realtor");
  }
  if (admin.role !== "owner") {
    redirect("/admin/login");
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

/**
 * Call this from any protected Server Component or Server Action under
 * /realtor. Redirects to /realtor/login if there's no session, and away
 * to each other role's own front door if a non-realtor staff account
 * somehow lands here.
 */
export async function requireRealtor() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/realtor/login");
  }
  if (admin.role === "owner") {
    redirect("/admin");
  }
  if (admin.role === "driver") {
    redirect("/driver");
  }
  if (admin.role !== "realtor") {
    redirect("/realtor/login");
  }
  return admin;
}

export async function getCurrentAdmin() {
  return getSessionAdmin();
}
