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
 * requireRole) or whose answer must be current, add its prefix here.
 */

/** Public pages, identical for every visitor, fetched ahead of time. */
export const PRECACHE_ROUTES = ["/", "/courses", "/contact", "/privacy", "/terms", "/offline"] as const;

/** Never cached, never served from cache. Matched by prefix. */
export const BYPASS_ROUTES = [
  // Signed-in areas: dashboards, earnings, bank details, payouts.
  "/student",
  "/instructor",
  "/admin",
  "/portal",

  // Public addresses that show something different when you are signed in.
  "/courses/", // a course page shows your enrolment and checkout — the list at /courses is fine
  "/teach", // shows your own application

  // Signing in, and everything around it.
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/two-factor",
  "/auth",

  // Must always be current. A cached answer is a wrong answer: a revoked
  // certificate would still look valid, a payment would still look pending.
  "/verify",
  "/payments",
] as const;
