/**
 * What does the service worker actually keep?
 *
 * It caches pages by path, not by visitor, so a signed-in page that got into
 * the cache could be shown to the next person on the same browser. The
 * exclusion list in config/precache-routes.ts is what prevents that — and it
 * can only be tested on the deployed site, because the worker switches its
 * fetch handling off on localhost.
 *
 * Signs in as a throwaway account, visits public and signed-in pages, then
 * reads Cache Storage directly: public pages may be there, signed-in pages
 * must not be. The account is removed afterwards.
 *
 *   npx tsx --env-file=.env scripts/verify-sw-cache.ts https://www.copaserve.com.ng
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";
import { BYPASS_ROUTES } from "../config/precache-routes";

const BASE = process.argv[2] ?? "https://www.copaserve.com.ng";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const results: string[] = [];
const check = (n: string, p: boolean, d = "") => results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

const PUBLIC = ["/", "/courses", "/contact", "/privacy", "/terms"];
const PRIVATE = ["/student", "/student/courses", "/student/payments", "/student/certificates", "/teach", "/login", "/verify"];

async function main() {
  const email = `sw-probe-${randomUUID().slice(0, 8)}@copaserve.com.ng`;
  const created = await admin.auth.admin.createUser({ email, password: `Pw-${randomUUID()}`, email_confirm: true, user_metadata: { first_name: "SW", last_name: "Probe" } });
  if (created.error) throw created.error;

  const exe = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync)!;
  const browser = await chromium.launch({ executablePath: exe });

  try {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const { data } = await anon.auth.verifyOtp({ type: "email", token_hash: link.data.properties!.hashed_token });
    const ref = new URL(U).hostname.split(".")[0];
    const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64");
    const ck = v.length <= 3180 ? [{ name: `sb-${ref}-auth-token`, value: v }]
      : Array.from({ length: Math.ceil(v.length / 3180) }, (_, i) => ({ name: `sb-${ref}-auth-token.${i}`, value: v.slice(i * 3180, (i + 1) * 3180) }));

    const context = await browser.newContext();
    await context.addCookies(ck.map((c) => ({ ...c, domain: new URL(BASE).hostname, path: "/", secure: true })));
    const page = await context.newPage();

    // Let the worker install and take control before browsing.
    await page.goto(BASE + "/", { waitUntil: "load" });
    const controlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 20 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 500));
      return Boolean(navigator.serviceWorker.controller);
    });
    if (!controlled) await page.reload({ waitUntil: "load" });
    const nowControlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    check("the worker is active and controlling the page", nowControlled);

    for (const path of [...PUBLIC, ...PRIVATE]) {
      await page.goto(BASE + path, { waitUntil: "load" }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    // Client-side navigation too: clicking links inside the portal fetches
    // page data (RSC) in the background rather than loading a document, and
    // the worker keeps a separate cache for that. Signed-in page data is as
    // private as the page, so it has to stay out as well.
    await page.goto(BASE + "/student", { waitUntil: "load" }).catch(() => {});
    const rscSeen: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.searchParams.has("_rsc") || r.headers()["rsc"] === "1") rscSeen.push(u.pathname);
    });
    for (const href of ["/student/courses", "/student/payments", "/student/certificates", "/student"]) {
      const link = page.locator(`a[href="${href}"]`).first();
      if (await link.count()) {
        await link.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    console.log(`client-side data requests made: ${[...new Set(rscSeen)].join(", ") || "none"}`);
    check("client-side navigation inside the portal happened", rscSeen.length > 0, `${rscSeen.length} requests`);
    await page.waitForTimeout(4000);

    const cached = await page.evaluate(async () => {
      const out: { cache: string; path: string }[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) out.push({ cache: name, path: new URL(req.url).pathname });
      }
      return out;
    });

    const paths = new Set(cached.map((c) => c.path));
    console.log(`caches: ${[...new Set(cached.map((c) => c.cache))].join(", ")}`);
    console.log(`html-looking entries: ${[...paths].filter((p) => !/\.(js|css|woff2?|png|jpe?g|svg|webp|ico|json|mp4)$/.test(p) && !p.startsWith("/_next/")).join(", ")}\n`);

    const leaked = [...paths].filter((p) => BYPASS_ROUTES.some((prefix) => p.startsWith(prefix)));
    check("no signed-in or excluded page is in the cache", leaked.length === 0, leaked.join(", ") || "none");

    for (const path of PRIVATE) {
      check(`${path} is not cached`, !paths.has(path));
    }

    const storedPublic = PUBLIC.filter((p) => paths.has(p));
    check("public pages are cached, so they work offline", storedPublic.length > 0, storedPublic.join(", "));

    // Offline: a public page should come from the cache, a signed-in one must not.
    await context.setOffline(true);
    await page.goto(BASE + "/privacy", { waitUntil: "load" }).catch(() => {});
    const offlinePublic = await page.locator("h1").first().textContent().catch(() => null);
    check("offline, a public page still opens", /privacy/i.test(offlinePublic ?? ""), offlinePublic ?? "nothing");

    await page.goto(BASE + "/student", { waitUntil: "load" }).catch(() => {});
    const offlinePrivate = (await page.locator("body").innerText().catch(() => "")).slice(0, 200);
    check("offline, a signed-in page is not served from the cache",
      !/My Courses|Dashboard|Welcome back, SW/i.test(offlinePrivate), offlinePrivate.replace(/\s+/g, " ").slice(0, 80));
    await context.setOffline(false);
  } finally {
    await browser.close();
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.notification.deleteMany({ where: { userId: user.id } });
      await prisma.consentLog.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.profile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    if (created.data.user) await admin.auth.admin.deleteUser(created.data.user.id);
    await prisma.$disconnect();
  }

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => { console.error(e); console.log(results.join("\n")); await prisma.$disconnect(); process.exit(1); });
