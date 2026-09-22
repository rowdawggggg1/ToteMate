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
  const isLoginRoute = pathname === "/admin/login";

  if (isAdminRoute && !isLoginRoute) {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
