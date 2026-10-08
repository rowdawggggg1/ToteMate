import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Next.js 16 replaced middleware.ts with proxy.ts. This runs before every
 * matched request. It only does a lightweight cookie-presence check so it
 * never needs a database connection here.
 *
 * The actual session validity (expiry, revocation, admin still active) is
 * independently re-checked server-side by requireAdmin() in
 * app/admin/(protected)/layout.tsx and again inside every sensitive Server
 * Action. This proxy check is a fast first gate, not the real authorization
 * boundary -- do not rely on it alone.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isDriverRoute = pathname.startsWith("/driver");
  const isRealtorRoute = pathname.startsWith("/realtor");
  const isLoginRoute =
    pathname === "/admin/login" || pathname === "/driver/login" || pathname === "/realtor/login";

  if ((isAdminRoute || isDriverRoute || isRealtorRoute) && !isLoginRoute) {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      // Drivers, realtors, and admins share one login cookie/table (see
      // lib/db/schema.ts's admins table), but each has its own front door
      // -- bounce back to whichever one this route belongs to.
      const loginPath = isDriverRoute ? "/driver/login" : isRealtorRoute ? "/realtor/login" : "/admin/login";
      const loginUrl = new URL(loginPath, request.url);
      if (isAdminRoute) {
        loginUrl.searchParams.set("next", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/driver/:path*", "/realtor/:path*"],
};
