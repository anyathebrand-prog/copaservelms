import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Session refresh plus a coarse authentication gate.
 *
 * Role checks are NOT done here: middleware has no database access, so it can
 * only tell whether someone is signed in. Which portal they may enter is
 * decided by requireRole() in the pages themselves.
 */
const PROTECTED_PREFIXES = ["/student", "/instructor", "/admin"];
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the destination so login can return them to it.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // A signed-in user has no use for the login page.
  if (userId && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/student";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images, and /api/verify.
     *
     * Verification is excluded deliberately, not for performance: it is the
     * public QR endpoint (§11.3) and must stay reachable even when Supabase
     * auth is unconfigured or degraded. Routing it through session refresh
     * would couple a certificate's public trust surface to the auth stack.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/verify|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
