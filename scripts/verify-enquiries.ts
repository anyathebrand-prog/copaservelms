/**
 * Functional checks for the corporate enquiry form.
 *
 * Driven through a real browser, because everything that matters here only
 * exists once a form has been submitted by something that behaves like a
 * person: the server action, the validation, the honeypot, the rate limit and
 * the row that has to appear at the other end. A server-side call to
 * submitEnquiry would prove the library works and nothing about the page.
 *
 *   npx tsx --env-file=.env scripts/verify-enquiries.ts http://127.0.0.1:3320
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright-core";
import { prisma } from "../lib/prisma";

const BASE = process.argv[2] ?? "http://127.0.0.1:3320";

const EXECUTABLES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const results: string[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));

/** Addresses created by this run, removed at the end whatever happens. */
const created: string[] = [];

async function open(page: Page) {
  await page.goto(`${BASE}/contact`, { waitUntil: "load", timeout: 60_000 });
  await page.locator(".boot-screen").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
}

async function fill(
  page: Page,
  values: { name?: string; email?: string; message?: string; organisation?: string },
) {
  if (values.name !== undefined) await page.fill('input[name="name"]', values.name);
  if (values.email !== undefined) await page.fill('input[name="email"]', values.email);
  if (values.organisation !== undefined) {
    await page.fill('input[name="organisation"]', values.organisation);
  }
  if (values.message !== undefined) await page.fill('textarea[name="message"]', values.message);
}

async function main() {
  const executablePath = EXECUTABLES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Edge or Chrome found to drive.");

  const browser = await chromium.launch({ executablePath });

  try {
    // --- the page is reachable without an account ----------------------------
    {
      const page = await browser.newPage();
      await open(page);
      check("the contact page loads signed out",
        (await page.locator('textarea[name="message"]').count()) === 1);
      check("and does not ask for consent it does not need",
        (await page.locator('input[type="checkbox"]').count()) === 0);
      await page.close();
    }

    // --- a real enquiry ------------------------------------------------------
    {
      const email = `verify-${randomUUID()}@example.com`;
      created.push(email);

      const page = await browser.newPage();
      await open(page);
      await fill(page, {
        name: "Ada Okonkwo",
        email,
        organisation: "Verification Ltd",
        message: "We need NDPA training for about forty staff before the end of the quarter.",
      });
      await page.selectOption('select[name="staffCount"]', "11–50").catch(() => {});
      await page.click('button[type="submit"]');

      await page.getByText("Thank you — we have it").waitFor({ timeout: 20_000 }).catch(() => {});
      check("a complete enquiry is accepted",
        (await page.getByText("Thank you — we have it").count()) === 1);

      const row = await prisma.enquiry.findFirst({
        where: { email },
        select: { name: true, organisation: true, message: true, status: true, source: true },
      });

      check("and reaches the database", row !== null);
      check("with what was typed, not something else",
        row?.name === "Ada Okonkwo" && row?.organisation === "Verification Ltd",
        `${row?.name} / ${row?.organisation}`);
      check("as unanswered", row?.status === "NEW", String(row?.status));
      check("tagged with where it came from", row?.source === "contact", String(row?.source));

      await page.close();
    }

    // --- what it refuses -----------------------------------------------------
    {
      const email = `verify-${randomUUID()}@example.com`;
      const page = await browser.newPage();
      await open(page);

      // A message too short to answer. Typed into the page, so the browser's own
      // required-field handling is part of what is being tested.
      await fill(page, { name: "Too Short", email, message: "hi" });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);

      const stored = await prisma.enquiry.count({ where: { email } });
      check("a message too short to answer is refused", stored === 0, `${stored} rows`);
      check("and the reason is shown rather than swallowed",
        (await page.locator('[role="alert"]').count()) === 1,
        (await page.locator('[role="alert"]').textContent().catch(() => null)) ?? "no alert");

      await page.close();
    }

    // --- the honeypot --------------------------------------------------------
    {
      const email = `verify-bot-${randomUUID()}@example.com`;
      const page = await browser.newPage();
      await open(page);
      await fill(page, {
        name: "Definitely A Person",
        email,
        message: "This should never reach the database at all.",
      });

      // Only something reading the markup fills this.
      await page.evaluate(() => {
        const field = document.querySelector<HTMLInputElement>('input[name="website"]');
        if (field) field.value = "https://spam.example";
      });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);

      const stored = await prisma.enquiry.count({ where: { email } });
      check("a filled honeypot stores nothing", stored === 0, `${stored} rows`);
      check("but is told it succeeded, so the next attempt is not adjusted",
        (await page.getByText("Thank you — we have it").count()) === 1);

      await page.close();
    }

    // --- the ceiling ---------------------------------------------------------
    {
      const email = `verify-flood-${randomUUID()}@example.com`;
      created.push(email);

      for (let attempt = 1; attempt <= 5; attempt++) {
        const page = await browser.newPage();
        await open(page);
        await fill(page, {
          name: "Repeat Sender",
          email,
          message: `Attempt number ${attempt}, which is long enough to be accepted.`,
        });
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1200);
        await page.close();
      }

      const stored = await prisma.enquiry.count({ where: { email } });
      check("one address cannot flood the inbox", stored === 3, `${stored} stored from 5 attempts`);
    }

    // --- nothing typed is ever markup ---------------------------------------
    {
      const email = `verify-xss-${randomUUID()}@example.com`;
      created.push(email);

      const page = await browser.newPage();
      await open(page);
      await fill(page, {
        name: "<img src=x onerror=alert(1)>",
        email,
        message: "<script>alert('stored')</script> Please send a quote for fifty staff.",
      });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);

      const row = await prisma.enquiry.findFirst({ where: { email }, select: { name: true } });
      check("markup is stored verbatim rather than stripped",
        row?.name === "<img src=x onerror=alert(1)>", String(row?.name));

      await page.close();
    }

    await browser.close();
  } finally {
    if (created.length > 0) {
      const removed = await prisma.enquiry.deleteMany({ where: { email: { in: created } } });
      console.log(`cleaned up ${removed.count} verification enquiries\n`);
    }
    await prisma.$disconnect();
  }

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (cause) => {
  console.error(cause);
  console.log(results.join("\n"));
  await prisma.$disconnect();
  process.exit(1);
});
