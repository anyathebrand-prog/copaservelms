/**
 * Does a lesson completed offline actually reach the record?
 *
 * The whole point of this integration is a network that is not there, so the
 * test takes the network away: Playwright's offline mode, a real click, then
 * the connection back. Nothing about that is observable from the server, and
 * nothing short of it proves the queue works — a unit test of addQueueEntrySafe
 * would prove the library stores things, which was never in doubt.
 *
 *   npx tsx --env-file=.env scripts/verify-offline-progress.ts http://127.0.0.1:3320
 */
import { existsSync } from "node:fs";
import { chromium, type BrowserContext } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";

const BASE = process.argv[2] ?? "http://127.0.0.1:3320";
const EMAIL = process.env.SMOKE_EMAIL ?? "student@demo.copaserve.test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const results: string[] = [];
const check = (n: string, p: boolean, d = "") =>
  results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

const EXECUTABLES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
];

function cookies(session: unknown) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const out: { name: string; value: string }[] = [];
  if (value.length <= 3180) out.push({ name, value });
  else for (let i = 0, n = 0; i < value.length; i += 3180, n++) out.push({ name: `${name}.${n}`, value: value.slice(i, i + 3180) });
  return out;
}

async function signIn(context: BrowserContext) {
  const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const verified = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties!.hashed_token,
  });
  const host = new URL(BASE).hostname;
  await context.addCookies(
    cookies(verified.data.session).map((c) => ({ ...c, domain: host, path: "/" })),
  );
}

async function main() {
  if (!EMAIL.endsWith("demo.copaserve.test")) {
    throw new Error("this test resets lesson progress — point it at a demo account only");
  }

  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`${EMAIL} not found — run: npx tsx --env-file=.env scripts/seed-demo.ts`);

  // An unfinished lesson on any course this learner is enrolled in. Looking at
  // only the first enrolment finds a fully completed course and stops.
  const enrolments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true, course: { select: { slug: true, id: true } } },
  });
  if (enrolments.length === 0) throw new Error("the demo student is not enrolled in anything");

  let enrolment: (typeof enrolments)[number] | null = null;
  let lesson: { id: string; title: string } | null = null;

  for (const candidate of enrolments) {
    const found = await prisma.lesson.findFirst({
      where: {
        module: { courseId: candidate.course.id },
        progress: { none: { enrollmentId: candidate.id, completed: true } },
      },
      select: { id: true, title: true },
      orderBy: { position: "asc" },
    });
    if (found) {
      enrolment = candidate;
      lesson = found;
      break;
    }
  }

  // The seed finishes every lesson, so make the fixture rather than hunt for
  // one: take the first lesson back to incomplete. Demo data only — the guard
  // above refuses to run against an account that is not the demo student.
  if (!enrolment || !lesson) {
    enrolment = enrolments[0]!;
    lesson = await prisma.lesson.findFirst({
      where: { module: { courseId: enrolment.course.id } },
      select: { id: true, title: true },
      orderBy: { position: "asc" },
    });
    if (!lesson) throw new Error("that course has no lessons");

    await prisma.lessonProgress.deleteMany({
      where: { enrollmentId: enrolment.id, lessonId: lesson.id },
    });
    console.log("(reset one lesson to incomplete to have something to finish)");
  }

  console.log(`lesson under test: ${lesson.title}\n`);

  const executablePath = EXECUTABLES.find(existsSync);
  if (!executablePath) throw new Error("no browser found");

  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await signIn(context);

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("flux")) console.log(`  [console] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));
  const url = `${BASE}/student/courses/${enrolment.course.slug}/lessons/${lesson.id}`;
  await page.goto(url, { waitUntil: "load", timeout: 90_000 });
  await page.locator(".boot-screen").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});

  // Located by position, not by label: the label is what changes when the
  // click lands, and a name-based locator stops matching the moment it works.
  const button = page.locator('form:has(input[name="lessonId"]) button[type="submit"]').first();
  check("the button is there", (await button.count()) === 1,
    (await button.textContent())?.trim() ?? "");

  // Wait for the queue to be live rather than guessing at a duration: before
  // that the button is a plain form submit, which is correct behaviour but not
  // what is under test.
  await page
    .locator('button[data-offline-ready="true"]')
    .waitFor({ timeout: 60_000 })
    .catch(() => {});
  check("the offline queue loaded in the browser",
    (await page.locator('button[data-offline-ready="true"]').count()) === 1,
    (await button.getAttribute("data-offline-ready")) ?? "attribute missing");

  // --- the network goes away ---------------------------------------------------
  await context.setOffline(true);
  await button.click();
  await page.waitForTimeout(4000);

  check("the learner is told it was saved locally",
    (await page.getByText(/saved (on this device|here)/i).count()) > 0,
    (await button.textContent().catch(() => null))?.trim() ?? "button gone");

  const midway = await prisma.lessonProgress.count({
    where: { enrollmentId: enrolment.id, lessonId: lesson.id, completed: true },
  });
  check("nothing reached the server while offline", midway === 0, `${midway} rows`);

  const queued = await page
    .evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map((d) => d.name).filter(Boolean) as string[];
    })
    .catch((e) => [`unavailable: ${String(e).slice(0, 40)}`]);
  check("an IndexedDB store exists for the queue",
    queued.length > 0 && !queued[0]!.startsWith("unavailable"), queued.join(", "));

  // --- the network comes back --------------------------------------------------
  await context.setOffline(false);
  // initReplayTriggers listens for the browser's own online event.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  let landed = 0;
  for (let attempt = 0; attempt < 20 && landed === 0; attempt++) {
    await page.waitForTimeout(1500);
    landed = await prisma.lessonProgress.count({
      where: { enrollmentId: enrolment.id, lessonId: lesson.id, completed: true },
    });
  }

  check("the completion replayed once the connection returned", landed === 1, `${landed} rows`);

  // --- and it did not double count ---------------------------------------------
  const activity = await prisma.lessonProgress.count({
    where: { enrollmentId: enrolment.id, lessonId: lesson.id },
  });
  check("exactly one progress row, not two", activity === 1, `${activity} rows`);

  // The privacy notice says a queued completion is deleted from the device
  // once it reaches us. That is a statement about the learner's own storage,
  // so it is checked rather than assumed from how the library ought to work.
  // Flux deletes the entry after the server answers, so checking the instant
  // the row appears races the deletion. Poll briefly instead.
  const countOnDevice = () => page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name).filter(Boolean) as string[];
    let entries = 0;
    for (const name of names) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        if (!/queue/i.test(store)) continue;
        entries += await new Promise<number>((resolve) => {
          const req = db.transaction(store).objectStore(store).count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(-1);
        });
      }
      db.close();
    }
    return entries;
  });
  let leftOnDevice = await countOnDevice();
  for (let attempt = 0; attempt < 10 && leftOnDevice !== 0; attempt++) {
    await page.waitForTimeout(1000);
    leftOnDevice = await countOnDevice();
  }
  check("the queued entry is gone from the device once delivered", leftOnDevice === 0,
    `${leftOnDevice} entries left`);

  await page.screenshot({ path: process.argv[3] ? `${process.argv[3]}/offline-progress.png` : "offline-progress.png" });
  await browser.close();

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);

  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (cause) => {
  console.error(cause);
  console.log(results.join("\n"));
  await prisma.$disconnect();
  process.exit(1);
});
