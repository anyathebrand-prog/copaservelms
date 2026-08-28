import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Session refresh plus a coarse authentication gate.
 *
 * Role checks are NOT done here: middleware has no database access, so it can
 * only tell whether someone is signed in. Which portal they may enter is
 * decided by requireRole() in the pages themselves, and where they land after
 * signing in is decided by /portal.
 */
const PROTECTED_PREFIXES = ["/student", "/instructor", "/admin"];
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Redirect while keeping any refreshed session cookies.
 *
 * updateSession may rotate the access and refresh tokens, writing the new
 * values onto its own response. Returning a fresh NextResponse.redirect()
 * silently discards them, and because Supabase invalidates a refresh token
 * once it is used, the browser is left holding one that no longer works. The
 * next request then fails authentication and bounces to /login, which sees a
 * valid session and bounces back — an endless loop that presents as a blank
 * page. Carrying the cookies across is what stops that.
 */
function redirectPreservingSession(url: URL, sessionResponse: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);

  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

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
    return redirectPreservingSession(url, response);
  }

  // A signed-in user has no use for the login page. Send them to /portal
  // rather than a fixed portal: middleware cannot read roles, so it must not
  // guess which dashboard is theirs.
  if (userId && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return redirectPreservingSession(url, response);
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
    "/((?!_next/static|_next/image|favicon.ico|api/verify|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
