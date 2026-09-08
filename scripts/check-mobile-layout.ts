/**
 * Find horizontal overflow on a phone.
 *
 * A page that is wider than the viewport lets the whole document scroll
 * sideways, which drags the fixed header and the bottom nav out of frame with
 * it. It looks like every element is broken; usually exactly one is.
 *
 * Nothing server-side can catch this — the markup is correct and the response
 * is a 200. It only exists once a browser has laid the page out at a real
 * width, so this drives a real browser and measures.
 *
 * Uses the copy of Edge or Chrome already on the machine rather than
 * downloading one.
 *
 *   npx tsx --env-file=.env.local scripts/check-mobile-layout.ts https://www.copaserve.com.ng
 */
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3200";
const EMAIL = process.env.SMOKE_EMAIL ?? "student@demo.copaserve.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? "CopaServe-Demo-2026!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** A small phone. If it fits here it fits on everything above it. */
const VIEWPORT = { width: 360, height: 780 };

const EXECUTABLES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function browserPath(): string {
  const found = EXECUTABLES.find((path) => existsSync(path));
  if (!found) throw new Error("No Chrome or Edge found. Set one of: " + EXECUTABLES.join(", "));
  return found;
}

/** @supabase/ssr stores the session as base64 JSON, chunked past ~3180 chars. */
function sessionCookies(session: unknown): { name: string; value: string }[] {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

  if (value.length <= 3180) return [{ name, value }];

  const chunks: { name: string; value: string }[] = [];
  for (let i = 0; i < value.length; i += 3180) {
    chunks.push({ name: `${name}.${chunks.length}`, value: value.slice(i, i + 3180) });
  }
  return chunks;
}

/**
 * Report every element whose right edge is past the viewport.
 *
 * Runs in the page. The culprit is normally the *innermost* offender: its
 * ancestors are wide only because it is, so listing them all and reading the
 * deepest one names the element to fix.
 */
const FIND_OVERFLOW = `(() => {
  const limit = document.documentElement.clientWidth;
  const out = [];

  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    // Fixed elements are positioned against the viewport, so they can sit past
    // a scrolled document without being the cause of the scroll.
    if (style.position === "fixed") continue;

    const box = el.getBoundingClientRect();
    if (box.width === 0) continue;
    if (box.right <= limit + 1 && box.left >= -1) continue;

    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 140),
      left: Math.round(box.left),
      right: Math.round(box.right),
      width: Math.round(box.width),
      depth: (() => { let d = 0, n = el; while ((n = n.parentElement)) d++; return d; })(),
      text: (el.textContent || "").trim().slice(0, 60),
    });
  }

  return {
    limit,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: out.sort((a, b) => b.depth - a.depth),
  };
})()`;

async function inspect(browser: Browser, cookies: { name: string; value: string }[], path: string) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const domain = new URL(BASE).hostname;
  await context.addCookies(
    cookies.map((cookie) => ({ ...cookie, domain, path: "/", sameSite: "Lax" as const })),
  );

  const page = await context.newPage();
  // "load" rather than "networkidle": a lesson whose media URL points at a
  // third-party page may never go idle, and layout has settled long before
  // that would matter. The pause lets fonts land, which changes text widths.
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const result = (await page.evaluate(FIND_OVERFLOW)) as {
    limit: number;
    scrollWidth: number;
    offenders: { tag: string; cls: string; left: number; right: number; width: number; text: string }[];
  };

  const over = result.scrollWidth - result.limit;
  const ok = over <= 1;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${path}\n` +
      `        viewport ${result.limit}px, document ${result.scrollWidth}px` +
      (ok ? "" : `  — ${over}px too wide`),
  );

  // Only named when the page actually scrolls. Decorative blurs are deliberately
  // wider than their box and sit inside an overflow-hidden parent, so they show
  // up here while costing the document nothing.
  for (const offender of ok ? [] : result.offenders.slice(0, 6)) {
    console.log(
      `        <${offender.tag}> ${offender.left}..${offender.right} (${offender.width}px)\n` +
        `           class="${offender.cls}"\n` +
        (offender.text ? `           text="${offender.text}"\n` : ""),
    );
  }

  await context.close();
  return ok;
}

async function main() {
  const paths = process.argv.slice(3);
  if (paths.length === 0) throw new Error("Pass one or more paths to check.");

  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);

  const browser = await chromium.launch({ executablePath: browserPath() });
  let failures = 0;

  try {
    for (const path of paths) {
      const ok = await inspect(browser, sessionCookies(data.session), path);
      if (!ok) failures += 1;
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${paths.length - failures}/${paths.length} fit in ${VIEWPORT.width}px`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
