/**
 * One phone, two learners.
 *
 * Learner A finishes a lesson with no signal; it is queued in IndexedDB. A signs
 * out and B signs in on the same browser. The connection comes back and the
 * queue replays — as B, because the endpoint takes the caller from the session.
 *
 * Flux can scope replay by user, but only on a tier with multi-tenant
 * isolation, and a licence that fails to verify falls back to the free tier
 * without saying so to the application. So the guarantee that matters here —
 * B is never credited with A's lesson — is tested against the endpoint's own
 * check, with both learners enrolled on the same course so that nothing else
 * would stop it.
 *
 *   npx tsx --env-file=.env scripts/verify-shared-device.ts http://127.0.0.1:3333
 */
import { existsSync } from "node:fs";
import { chromium, type BrowserContext } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";

const BASE = process.argv[2] ?? "http://127.0.0.1:3333";
const A = "student@demo.copaserve.test";
const B = "student2@demo.copaserve.test";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const results: string[] = [];
const check = (n: string, p: boolean, d = "") =>
  results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

function cookies(session: unknown) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const out: { name: string; value: string }[] = [];
  if (value.length <= 3180) out.push({ name, value });
  else for (let i = 0, n = 0; i < value.length; i += 3180, n++) out.push({ name: `${name}.${n}`, value: value.slice(i, i + 3180) });
  return out;
}

async function sessionFor(email: string) {
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data } = await anon.auth.verifyOtp({ type: "email", token_hash: link.data.properties!.hashed_token });
  return data.session;
}

async function signInAs(context: BrowserContext, email: string) {
  await context.clearCookies();
  const host = new URL(BASE).hostname;
  await context.addCookies(cookies(await sessionFor(email)).map((c) => ({ ...c, domain: host, path: "/" })));
}

async function main() {
  const [userA, userB] = await Promise.all(
    [A, B].map((email) => prisma.user.findFirst({ where: { email }, select: { id: true } })),
  );
  if (!userA || !userB) throw new Error("demo students missing — run scripts/seed-demo.ts");

  // A course A is enrolled in, with B enrolled too, so that without the check
  // B really would be credited. Enrolling B is a demo-data fixture.
  const enrolA = await prisma.enrollment.findFirst({
    where: { userId: userA.id },
    select: { id: true, courseId: true, course: { select: { slug: true } } },
  });
  if (!enrolA) throw new Error("student A has no enrolment");

  const enrolB = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: userB.id, courseId: enrolA.courseId } },
    update: { status: "ACTIVE" },
    create: { userId: userB.id, courseId: enrolA.courseId, status: "ACTIVE", startedAt: new Date() },
    select: { id: true },
  });

  const lesson = await prisma.lesson.findFirst({
    where: { module: { courseId: enrolA.courseId } },
    select: { id: true, title: true },
    orderBy: { position: "asc" },
  });
  if (!lesson) throw new Error("no lessons");

  // Neither learner has this lesson done.
  await prisma.lessonProgress.deleteMany({
    where: { lessonId: lesson.id, enrollmentId: { in: [enrolA.id, enrolB.id] } },
  });

  const url = `${BASE}/student/courses/${enrolA.course.slug}/lessons/${lesson.id}`;
  const exe = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync)!;
  const browser = await chromium.launch({ executablePath: exe });
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });

  const replayed: number[] = [];
  context.on("response", (r) => {
    if (r.url().includes("/api/progress/complete")) replayed.push(r.status());
  });

  // --- A queues offline -------------------------------------------------------
  await signInAs(context, A);
  const pageA = await context.newPage();
  await pageA.goto(url, { waitUntil: "load", timeout: 90_000 });
  const button = pageA.locator('form:has(input[name="lessonId"]) button[type="submit"]').first();
  await pageA.locator('button[data-offline-ready="true"]').waitFor({ timeout: 60_000 });

  await context.setOffline(true);
  await button.click();
  await pageA.getByText(/saved (on this device|here)/i).waitFor({ timeout: 15_000 }).catch(() => {});
  check("A's completion is queued on the device",
    (await pageA.getByText(/saved (on this device|here)/i).count()) > 0);
  await pageA.close();

  // --- B signs in on the same phone, then the signal returns --------------------
  await signInAs(context, B);
  await context.setOffline(false);
  const pageB = await context.newPage();
  await pageB.goto(url, { waitUntil: "load", timeout: 90_000 });
  await pageB.locator('button[data-offline-ready="true"]').waitFor({ timeout: 60_000 }).catch(() => {});
  await pageB.evaluate(() => window.dispatchEvent(new Event("online")));
  await pageB.waitForTimeout(12_000);

  const [progressA, progressB] = await Promise.all(
    [enrolA.id, enrolB.id].map((enrollmentId) =>
      prisma.lessonProgress.count({ where: { enrollmentId, lessonId: lesson.id, completed: true } }),
    ),
  );

  // Two layers can stop this, and which one fires depends on the Flux tier:
  // with multi-tenant isolation the queue never replays A's entry for B at
  // all; without it (the free tier a failed licence falls back to) it replays
  // and the endpoint refuses it. Either is a pass: the outcome is what counts.
  if (replayed.length === 0) {
    check("Flux kept A's entry away from B's session", true, "not replayed, isolation held");
  } else {
    check("the server refused A's entry under B's session", replayed.every((s) => s === 403),
      `responses: ${replayed.join(", ")}`);
  }
  check("B was NOT credited with A's lesson", progressB === 0, `${progressB} rows for B`);
  check("nor was A's progress written under B's session", progressA === 0, `${progressA} rows for A`);

  // --- the server backstop, tested directly ------------------------------------
  //
  // Production's licence cannot currently verify (the vendor's key server
  // refuses cross-origin requests), so it runs on the free tier without
  // multi-tenant isolation. The endpoint check is then the only thing between
  // a shared phone and a misattributed lesson, so it is proved on its own
  // rather than inferred from whichever layer happened to fire above.
  const sessionB = await sessionFor(B);
  const cookieHeader = cookies(sessionB).map((c) => `${c.name}=${c.value}`).join("; ");
  const post = (payload: unknown) =>
    fetch(`${BASE}/api/progress/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(payload),
    });

  const foreign = await post({ lessonId: lesson.id, userId: userA.id });
  check("an entry carrying another learner's id is refused", foreign.status === 403, String(foreign.status));

  const afterForeign = await prisma.lessonProgress.count({
    where: { enrollmentId: enrolB.id, lessonId: lesson.id, completed: true },
  });
  check("and wrote nothing", afterForeign === 0, `${afterForeign} rows`);

  const own = await post({ lessonId: lesson.id, userId: userB.id });
  check("B's own entry is still accepted", own.status === 200, String(own.status));

  const afterOwn = await prisma.lessonProgress.count({
    where: { enrollmentId: enrolB.id, lessonId: lesson.id, completed: true },
  });
  check("and recorded for B", afterOwn === 1, `${afterOwn} rows`);

  await browser.close();

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  console.log(results.join("\n"));
  await prisma.$disconnect();
  process.exit(1);
});
