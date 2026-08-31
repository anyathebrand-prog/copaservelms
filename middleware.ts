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
  /*
   * Only the routes where a session actually matters.
   *
   * This used to match everything except static assets, which meant the
   * landing page, the catalogue and the public verification page all ran
   * session refresh. Touching auth cookies makes a response personalised, so
   * every one of them was served `private, no-store` and could never be cached
   * at the edge — each visitor paid a round trip to the function region for
   * content identical for everyone.
   *
   * Public pages now skip middleware entirely and can be served from a nearby
   * edge. A signed-in reader browsing them is not refreshed mid-visit, which
   * costs nothing: the refresh happens as soon as they open a portal route,
   * and every protected page checks the session again server-side regardless.
   */
  matcher: [
    "/student/:path*",
    "/instructor/:path*",
    "/admin/:path*",
    "/portal",
    "/login",
    "/signup",
  ],
};
