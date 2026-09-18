/**
 * Do email links actually sign people in, wherever they land?
 *
 * This project's Supabase emails can use the implicit flow, which delivers the
 * session in the URL fragment. The server cannot see a fragment, so each shape
 * of link is followed in a real browser and the result checked on the page.
 *
 * Uses links generated with the service-role key — the same URL an email would
 * carry — for a throwaway account created and removed here.
 *
 *   npx tsx --env-file=.env scripts/verify-email-links.ts http://127.0.0.1:3338
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";

const BASE = process.argv[2] ?? "http://127.0.0.1:3338";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: string[] = [];
const check = (n: string, p: boolean, d = "") =>
  results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

async function follow(browser: Browser, email: string, type: "magiclink" | "recovery", next: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: `${BASE}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.properties?.action_link) throw new Error(`no link: ${error?.message}`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(data.properties.action_link, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(7000);
  return { page, context };
}

async function main() {
  const email = `link-probe-${randomUUID().slice(0, 8)}@copaserve.com.ng`;
  const created = await admin.auth.admin.createUser({
    email,
    password: `Probe-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { first_name: "Link", last_name: "Probe" },
  });
  if (created.error) throw new Error(`could not create probe: ${created.error.message}`);

  const exe = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync)!;
  const browser = await chromium.launch({ executablePath: exe });

  try {
    // --- applying to teach --------------------------------------------------------
    {
      const { page, context } = await follow(browser, email, "magiclink", "/teach");
      const url = new URL(page.url());
      // No reload: the page must redraw signed in on its own. Polled, because
      // the redraw follows setSession and a server round-trip.
      let radios = 0;
      for (let i = 0; i < 15 && radios === 0; i++) {
        radios = await page.locator('input[name="videoExperience"]').count();
        if (radios === 0) await page.waitForTimeout(1000);
      }
      check("a link bound for /teach lands there", url.pathname === "/teach", url.pathname);
      check("signed in, with both new questions",
        (await page.locator('input[name="videoExperience"]').count()) === 4 &&
          (await page.locator('input[name="audienceSize"]').count()) === 3);
      check("and the tokens are gone from the address bar", !url.hash.includes("access_token"), url.hash.slice(0, 30) || "clean");
      await context.close();
    }

    // --- an ordinary new learner --------------------------------------------------
    {
      const { page, context } = await follow(browser, email, "magiclink", "/portal");
      const url = new URL(page.url());
      check("a link bound for /portal ends in a dashboard, not the sign-in page",
        url.pathname.startsWith("/student") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/instructor"),
        url.pathname);
      check("with no tokens left in the address bar", !url.hash.includes("access_token"));
      await context.close();
    }

    // --- password reset keeps working ---------------------------------------------
    {
      const { page, context } = await follow(browser, email, "recovery", "/reset-password");
      const url = new URL(page.url());
      check("a recovery link still reaches the reset page", url.pathname === "/reset-password", url.pathname);
      check("and offers a new password rather than an expired-link message",
        (await page.locator('input[type="password"]').count()) >= 1, `${await page.locator('input[type="password"]').count()} password fields`);
      await context.close();
    }
  } finally {
    await browser.close();
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.instructorApplication.deleteMany({ where: { userId: user.id } });
      await prisma.notification.deleteMany({ where: { userId: user.id } });
      await prisma.consentLog.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.profile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    if (created.data.user) await admin.auth.admin.deleteUser(created.data.user.id);
    console.log(`probe ${email} removed\n`);
    await prisma.$disconnect();
  }

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  console.log(results.join("\n"));
  await prisma.$disconnect();
  process.exit(1);
});
