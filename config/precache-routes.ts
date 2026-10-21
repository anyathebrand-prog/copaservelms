/**
 * What the Flux service worker may store, and what it must never touch.
 *
 * The worker caches every page it serves, keyed by path alone — it has no idea
 * who was signed in when the page was fetched. On a shared phone or a café
 * computer that means one person's dashboard, earnings or bank details could
 * be shown to the next person to use the browser while offline or on a weak
 * connection. So anything that differs by visitor, or must be live, is listed
 * in BYPASS_ROUTES and never cached.
 *
 * If you add a page that reads the signed-in user (getCurrentUser, requireUser,
 * requireRole) or whose answer must be current, add its prefix to BYPASS_ROUTES.
 *
 * A second rule, learned the hard way: a route that can answer with a redirect
 * must never be precached. A service worker is not allowed to hand a redirected
 * response back for a page navigation — the browser rejects it outright and
 * shows ERR_FAILED instead of the page. Everything the middleware matcher
 * covers can redirect, so everything it covers is bypassed below.
 */

/** Public pages, identical for every visitor, fetched ahead of time. */
export const PRECACHE_ROUTES = [
  "/",
  "/courses",
  "/courses/",
  "/contact",
  "/privacy",
  "/terms",
  "/offline",
  "/forgot-password",
  "/reset-password",
] as const;

/** Never cached, never served from cache. Matched by prefix. */
export const BYPASS_ROUTES = [
  // Signing in, and everything around it.
  "/two-factor",
  "/auth",

  // Every path the middleware matcher covers. Each of these answers with a
  // redirect in at least one case — /portal in every case, since it exists
  // only to work out which dashboard is yours and send you there. Caching a
  // redirect broke sign-in completely: the browser refused the response and
  // showed ERR_FAILED after both email and Google sign-in.
  "/portal",
  "/student",
  "/instructor",
  "/admin",
  "/login",
  "/signup",

  // Reads the signed-in user to show their own application, so it differs by
  // visitor even though it is a public page.
  "/teach",

  // Must always be current. A cached answer is a wrong answer: a revoked
  // certificate would still look valid, a payment would still look pending.
  "/verify",
  "/payments",
] as const;
