/**
 * The service worker must never be given a route that can redirect.
 *
 * This exists because of a real outage. /portal answers with a redirect in
 * every case — it exists only to work out which dashboard is yours and send
 * you there. It was listed in PRECACHE_ROUTES, so the worker intercepted the
 * navigation and fetched it with redirect: "follow", producing a response
 * marked redirected = true. A service worker may not return such a response
 * for a navigation: the browser rejects it and shows ERR_FAILED. Sign-in was
 * broken for everyone, by email and by Google alike, and the page looked like
 * the site was down.
 *
 * Two checks, because one catches the rule and the other catches reality.
 *
 * The static check needs nothing running. Everything the middleware matcher
 * covers can redirect — that is what middleware is for — so everything it
 * covers must be bypassed and must not be precached. Adding a route to the
 * matcher without bypassing it fails here, at the point someone writes it.
 *
 * The live check asks the deployment. A precached route that answers with
 * anything but 200 is the same bug arriving by a different door: a page that
 * starts redirecting later, for a reason unrelated to middleware.
 *
 *   npx tsx scripts/verify-precache-safety.ts                      (static only)
 *   npx tsx scripts/verify-precache-safety.ts https://www.copaserve.com.ng
 */
import { readFileSync } from "node:fs";
import { BYPASS_ROUTES, PRECACHE_ROUTES } from "../config/precache-routes";

const BASE = process.argv[2] ?? null;
const results: string[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));

/** The paths middleware runs on, as plain prefixes: "/student/:path*" -> "/student". */
function middlewarePrefixes(): string[] {
  const source = readFileSync("middleware.ts", "utf8");
  const block = source.slice(source.indexOf("matcher: ["));
  const list = block.slice(0, block.indexOf("]"));
  const found = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/\/:path\*$/, ""));
  if (found.length === 0) throw new Error("could not read the middleware matcher");
  return found;
}

/**
 * Does `route` cover `path`?
 *
 * "/" is the home page, not a prefix for the whole site — without that case
 * every path "starts with" it and the checks below pass or fail for the wrong
 * reason. Both lists are matched by prefix elsewhere, as the worker does.
 */
const covers = (route: string, path: string) =>
  route === "/" ? path === "/" : path === route || path.startsWith(route);

const bypassed = (path: string) => BYPASS_ROUTES.some((p) => covers(p, path));
const precached = (path: string) =>
  PRECACHE_ROUTES.some((p) => covers(p, path) || p.startsWith(path + "/"));

// --- the rule ------------------------------------------------------------------
const matcher = middlewarePrefixes();
check(`the middleware matcher was read (${matcher.length} paths)`, matcher.length > 0, matcher.join(" "));

const unbypassed = matcher.filter((p) => !bypassed(p));
check(
  "every route middleware runs on is bypassed by the service worker",
  unbypassed.length === 0,
  unbypassed.length ? `not bypassed: ${unbypassed.join(", ")}` : "all covered",
);

const alsoPrecached = matcher.filter((p) => precached(p));
check(
  "and none of them is precached",
  alsoPrecached.length === 0,
  alsoPrecached.length ? `precached: ${alsoPrecached.join(", ")}` : "none",
);

// A route cannot be in both lists; whichever wins, the intent is unclear.
// Compared as plain strings: both lists are `as const`, so TypeScript can
// prove today's contents do not overlap and calls the check unreachable. It
// is here for the edit that makes them overlap, which is the one that matters.
const precacheList: readonly string[] = PRECACHE_ROUTES;
const bypassList: readonly string[] = BYPASS_ROUTES;
const both = precacheList.filter((p) => bypassList.includes(p));
check("no route is in both lists", both.length === 0, both.join(", ") || "none");

// --- reality --------------------------------------------------------------------
async function live() {
  if (!BASE) {
    results.push("SKIP  live check — pass a base URL to run it");
    return;
  }

  for (const route of PRECACHE_ROUTES) {
    // "/courses/" is a prefix for course pages, not a page itself.
    if (route.endsWith("/") && route !== "/") continue;

    const response = await fetch(BASE + route, { redirect: "manual" }).catch(() => null);
    const status = response?.status ?? 0;
    check(
      `${route} answers 200, so the worker can cache it`,
      status === 200,
      status === 0 ? "unreachable" : `HTTP ${status}` + (status >= 300 && status < 400 ? " — a redirect would break navigation" : ""),
    );
  }
}

live().finally(() => {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  const skipped = results.filter((r) => r.startsWith("SKIP")).length;
  console.log(`\n${results.length - failed - skipped}/${results.length - skipped} passed${BASE ? ` against ${BASE}` : " (static only)"}`);
  process.exit(failed ? 1 : 0);
});
