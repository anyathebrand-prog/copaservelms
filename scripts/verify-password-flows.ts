/**
 * Functional checks for the password flows.
 *
 * These cannot be checked from the server. The sign-in form bails to
 * client-side rendering (it reads useSearchParams), so the "Forgot your
 * password?" link is not in the HTML at all — curl sees a 200 and an empty
 * shell. Every one of these flows is a browser talking to Supabase.
 *
 * The change-password round trip really does change the demo account's
 * password and really does put it back, because a test that stops short of
 * the write does not test the thing that matters.
 *
 *   npx tsx --env-file=.env scripts/verify-password-flows.ts http://127.0.0.1:3260
 */
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3260";
const EMAIL = "student@demo.copaserve.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? "CopaServe-Demo-2026!";
const TEMP_PASSWORD = "Temp-" + Math.random().toString(36).slice(2, 10) + "-Aa1";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const EXECUTABLES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
];

const results: string[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

function sessionCookies(session: unknown) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = "sb-" + ref + "-auth-token";
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  if (value.length <= 3180) return [{ name, value }];

  const chunks: { name: string; value: string }[] = [];
  for (let i = 0; i < value.length; i += 3180) {
    chunks.push({ name: name + "." + chunks.length, value: value.slice(i, i + 3180) });
  }
  return chunks;
}

/** Can this password sign in right now? Asked of Supabase, not of the UI. */
async function canSignIn(password: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password });
  return !error && Boolean(data.session);
}

const PANEL = 'section:has-text("Change password")';

async function submitPanel(page: Page, current: string, next: string) {
  const fields = page.locator(PANEL + ' input[type="password"]');
  await fields.nth(0).fill(current);
  await fields.nth(1).fill(next);
  await fields.nth(2).fill(next);
  await page.locator(PANEL + ' button[type="submit"]').click();
}

async function main() {
  const executablePath = EXECUTABLES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome or Edge found.");

  const browser = await chromium.launch({ executablePath });

  // --- the link exists and goes somewhere ------------------------------------
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/login", { waitUntil: "load" });
    await page.waitForTimeout(1500);

    const link = page.getByRole("link", { name: /forgot your password/i });
    const visible = await link.isVisible().catch(() => false);
    check("sign-in offers a forgot-password link", visible);

    if (visible) {
      await link.click();
      await page.waitForURL("**/forgot-password", { timeout: 10_000 }).catch(() => {});
      const path = new URL(page.url()).pathname;
      check("the link reaches /forgot-password", path === "/forgot-password", path);
    }
    await page.close();
  }

  // --- requesting a link must not reveal whether the account exists ----------
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/forgot-password", { waitUntil: "load" });
    await page.locator('input[type="email"]').fill("definitely-not-a-user@demo.copaserve.test");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(4000);

    const body = (await page.textContent("body")) ?? "";
    check(
      "an unknown address still reports success",
      /check your email/i.test(body),
      body.replace(/\s+/g, " ").slice(0, 90),
    );
    await page.close();
  }

  // --- a reset page with no recovery session says so -------------------------
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/reset-password", { waitUntil: "load" });
    await page.waitForTimeout(2000);

    const body = (await page.textContent("body")) ?? "";
    check(
      "reset without a valid link is refused",
      /expired/i.test(body),
      body.replace(/\s+/g, " ").slice(0, 90),
    );
    await page.close();
  }

  // --- a real recovery link, both shapes Supabase can send --------------------
  //
  // This is the part that was broken and looked fine: /auth/callback only
  // understood ?code=, so an implicit-flow link dropped its tokens on /login
  // where nothing read them. Nothing short of following a real link catches it.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const shape of ["fragment", "token_hash"] as const) {
      const recovered = "Recovered-" + Math.random().toString(36).slice(2, 8) + "-Aa1";
      const redirectTo = BASE + "/auth/callback?next=" + encodeURIComponent("/reset-password");

      const { data: link, error: mintFailed } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: EMAIL,
        options: { redirectTo },
      });

      if (mintFailed || !link.properties) {
        check("mint a recovery link (" + shape + ")", false, mintFailed?.message ?? "no link");
        continue;
      }

      // token_hash goes through /auth/callback, which is the whole point of
      // that shape. The fragment shape is built here rather than followed from
      // Supabase's own redirect: whether Supabase will redirect to a given
      // host is its redirect allow-list, which is project configuration and
      // differs per environment. What this has to prove is that *our* pages
      // handle a fragment correctly, and that is deterministic.
      let url: string;

      if (shape === "token_hash") {
        url =
          BASE + "/auth/callback?token_hash=" + link.properties.hashed_token +
          "&type=recovery&next=" + encodeURIComponent("/reset-password");
      } else {
        const plain = createClient(SUPABASE_URL, ANON, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: verified, error: verifyFailed } = await plain.auth.verifyOtp({
          type: "recovery",
          token_hash: link.properties.hashed_token,
        });

        if (verifyFailed || !verified.session) {
          check("mint a fragment session", false, verifyFailed?.message ?? "no session");
          continue;
        }

        url =
          BASE + "/reset-password#access_token=" + verified.session.access_token +
          "&refresh_token=" + verified.session.refresh_token + "&type=recovery";
      }

      // A context per shape. Sharing one leaks the previous link's session
      // cookie into the next test, which is exactly the thing being measured.
      const linkContext = await browser.newContext();
      const page = await linkContext.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 45_000 });
      await page.waitForTimeout(2500);

      const landed = new URL(page.url()).pathname;
      check("recovery link (" + shape + ") lands on the reset form", landed === "/reset-password", landed);

      const fields = page.locator('input[type="password"]');
      const usable = await fields
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      check(
        "recovery link (" + shape + ") gives a usable form",
        usable,
        usable ? "" : ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").slice(0, 90),
      );

      if (usable) {
        await fields.nth(0).fill(recovered);
        await fields.nth(1).fill(recovered);
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(4000);
        check("recovery link (" + shape + ") actually sets the password", await canSignIn(recovered));
      }

      await linkContext.close();

      // Put it back before the next shape is tried.
      const { data: users } = await admin.auth.admin.listUsers();
      const user = users?.users.find((u) => u.email === EMAIL);
      if (user) await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
    }
  } else {
    check("recovery links exercised", false, "SUPABASE_SERVICE_ROLE_KEY not set — skipped");
  }

  // --- the change-password panel, signed in ----------------------------------
  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });

  if (error || !data.session) {
    check("sign in as the demo student", false, error?.message ?? "no session");
    return finish(browser);
  }

  const context = await browser.newContext();
  await context.addCookies(
    sessionCookies(data.session).map((c) => ({
      ...c,
      domain: new URL(BASE).hostname,
      path: "/",
      sameSite: "Lax" as const,
    })),
  );

  const page = await context.newPage();
  await page.goto(BASE + "/student/profile", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  check("the profile page offers a password panel", await page.locator(PANEL).isVisible().catch(() => false));

  // A wrong current password must be refused, and must change nothing.
  await submitPanel(page, "definitely-the-wrong-one", TEMP_PASSWORD);
  await page.waitForTimeout(3000);
  check("a wrong current password is refused",
    /not your current password/i.test((await page.textContent("body")) ?? ""));
  check("and the real password still works", await canSignIn(PASSWORD));

  // The real round trip.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  await submitPanel(page, PASSWORD, TEMP_PASSWORD);
  await page.waitForTimeout(4000);
  check("the password can be changed",
    /password changed/i.test((await page.textContent("body")) ?? ""));
  check("the new password works", await canSignIn(TEMP_PASSWORD));
  check("the old password stops working", !(await canSignIn(PASSWORD)));

  // Put it back, whatever happened above.
  const restore = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: failed } = await restore.auth.signInWithPassword({
    email: EMAIL,
    password: TEMP_PASSWORD,
  });
  if (!failed) await restore.auth.updateUser({ password: PASSWORD });
  check("the demo password is restored", await canSignIn(PASSWORD));

  await context.close();
  return finish(browser);
}

async function finish(browser: Browser) {
  await browser.close();
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log("\n" + passed + "/" + results.length + " passed");
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  console.log(results.join("\n"));
  process.exit(1);
});
