/**
 * Lesson uploads, end to end in a real browser.
 *
 * verify-lesson-media.ts proves the rules; this proves the experience. An
 * instructor uploads a real video and a real PDF through the course builder's
 * own control, then a learner opens the lessons and the player actually plays
 * them. Around that, the access route is asked the questions an attacker
 * would ask: signed out, and signed in but not enrolled.
 *
 * The video is recorded by the browser itself from a canvas, so the test needs
 * no fixture files and no ffmpeg, and the player is given something it can
 * genuinely decode.
 *
 * Run it against a local production build, or against the live site to
 * include the service worker, which is switched off on localhost:
 *
 *   npx tsx --env-file=.env scripts/verify-lesson-media-browser.ts http://127.0.0.1:3400
 *   npx tsx --env-file=.env scripts/verify-lesson-media-browser.ts https://www.copaserve.com.ng
 *
 * Creates throwaway accounts and a draft course, and removes all of it.
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { lessonMediaKey } from "../lib/lesson-media";
import { LESSON_MEDIA_BUCKET, getStorage } from "../lib/storage";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3400").replace(/\/$/, "");
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const storage = getStorage(LESSON_MEDIA_BUCKET);

const RUN = randomUUID().slice(0, 8);
const results: string[] = [];
const check = (n: string, p: boolean, d = "") => results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

const authIds: string[] = [];
let courseId: string | null = null;
let browser: Browser | null = null;

/** A real account, signed in by cookie, as the portal would see it. */
async function account(label: string): Promise<{ appUserId: string; context: BrowserContext }> {
  const email = `lm-${label}-${RUN}@copaserve.com.ng`;
  const created = await admin.auth.admin.createUser({
    email,
    password: `Pw-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { first_name: label, last_name: "Probe" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("no user");
  authIds.push(created.data.user.id);

  // The app's row is made by a trigger on the auth table; give it a moment.
  let appUserId: string | null = null;
  for (let i = 0; i < 20 && !appUserId; i++) {
    const row = await prisma.user.findFirst({ where: { supabaseUserId: created.data.user.id }, select: { id: true } });
    appUserId = row?.id ?? null;
    if (!appUserId) await new Promise((r) => setTimeout(r, 500));
  }
  if (!appUserId) throw new Error(`no app user for ${email}`);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data } = await anon.auth.verifyOtp({ type: "email", token_hash: link.data.properties!.hashed_token });
  const ref = new URL(U).hostname.split(".")[0];
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64");
  const cookies =
    value.length <= 3180
      ? [{ name: `sb-${ref}-auth-token`, value }]
      : Array.from({ length: Math.ceil(value.length / 3180) }, (_, i) => ({
          name: `sb-${ref}-auth-token.${i}`,
          value: value.slice(i * 3180, (i + 1) * 3180),
        }));

  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(
    cookies.map((c) => ({ ...c, domain: new URL(BASE).hostname, path: "/", secure: BASE.startsWith("https") })),
  );
  return { appUserId, context };
}

async function samplePdf(dir: string): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("NDPA essentials — module reading", { x: 50, y: 760, size: 20, font });
  page.drawText(`Browser upload check ${RUN}`, { x: 50, y: 720, size: 12, font });
  const path = join(dir, "NDPA Reading (Week 1).pdf");
  writeFileSync(path, await doc.save());
  return path;
}

/** Two seconds of real VP8 video, recorded by the browser from a canvas. */
async function sampleVideo(dir: string): Promise<string> {
  const page = await (await browser!.newContext()).newPage();
  await page.goto("about:blank");
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(25);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${(frame * 9) % 360} 70% 40%)`;
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#fff";
      ctx.font = "28px sans-serif";
      ctx.fillText(`frame ${frame++}`, 90, 100);
    }, 40);
    recorder.start(250);
    await new Promise((r) => setTimeout(r, 2000));
    recorder.stop();
    await new Promise((r) => (recorder.onstop = r));
    clearInterval(timer);
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  await page.context().close();
  const path = join(dir, "Intro to data protection.webm");
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

async function main() {
  const exe = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find(existsSync)!;
  browser = await chromium.launch({ executablePath: exe });

  const dir = mkdtempSync(join(tmpdir(), "lesson-media-"));
  const [pdfPath, videoPath] = [await samplePdf(dir), await sampleVideo(dir)];

  const instructor = await account("teacher");
  const learner = await account("learner");
  const outsider = await account("outsider");

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "INSTRUCTOR" as never }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: instructor.appUserId, roleId: role.id } });

  const category = await prisma.category.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      title: `Upload check ${RUN}`,
      slug: `upload-check-${RUN}`,
      status: "DRAFT",
      instructorId: instructor.appUserId,
      categoryId: category.id,
      priceMinor: 0,
      modules: {
        create: [
          {
            title: "Getting started",
            position: 1,
            lessons: {
              create: [
                { title: "Welcome video", type: "VIDEO", position: 1 },
                { title: "Week one reading", type: "PDF", position: 2 },
              ],
            },
          },
        ],
      },
    },
    select: { id: true, slug: true, modules: { select: { lessons: { orderBy: { position: "asc" }, select: { id: true } } } } },
  });
  courseId = course.id;
  const [videoLesson, pdfLesson] = course.modules[0].lessons.map((l) => l.id);

  // --- the instructor uploads, through the builder's own control -------------------
  const builder = await instructor.context.newPage();
  await builder.goto(`${BASE}/instructor/courses/${course.id}`, { waitUntil: "load" });

  for (const [lessonTitle, file, expectName] of [
    ["Welcome video", videoPath, "intro-to-data-protection.webm"],
    ["Week one reading", pdfPath, "ndpa-reading-week-1.pdf"],
  ] as const) {
    const row = builder.locator("details", { hasText: lessonTitle });
    await row.locator("summary").click();
    await row.locator('input[type="file"]').setInputFiles(file);
    const done = await row
      .getByText(expectName)
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    const error = await row.locator('[role="alert"]').textContent().catch(() => null);
    check(`the builder uploads a ${lessonTitle === "Welcome video" ? "video" : "PDF"} and shows its name`, done, error ?? expectName);

    const linkFieldGone = (await row.locator('input[name="contentUrl"]').count()) === 0;
    const typeLocked = await row.locator('select[name="type"]').isDisabled();
    check(`  with the link field gone and the type fixed by the file`, linkFieldGone && typeLocked);
  }

  await builder.locator("details", { hasText: "Welcome video" }).screenshot({ path: join(dir, "builder-uploaded.png") });

  // Too large: refused in the browser, before a byte is sent.
  const readingRow = builder.locator("details", { hasText: "Week one reading" });
  const tooBig = join(dir, "too-big.pdf");
  writeFileSync(tooBig, Buffer.alloc(51 * 1024 * 1024 + 1, 0x20));
  await readingRow.locator('input[type="file"]').setInputFiles(tooBig);
  const refusal = await readingRow.locator('[role="alert"]').textContent({ timeout: 10_000 }).catch(() => null);
  check("a file over the limit is refused in the browser with the sizes named",
    /limit is 50(\.0)? MB/.test(refusal ?? ""), refusal ?? "no message");
  await readingRow.screenshot({ path: join(dir, "builder-too-large.png") });

  const rows = await prisma.lesson.findMany({ where: { id: { in: [videoLesson, pdfLesson] } }, select: { id: true, type: true, contentUrl: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  check("the lessons now hold storage references with matching types",
    byId.get(videoLesson)?.type === "VIDEO" && byId.get(pdfLesson)?.type === "PDF" &&
      rows.every((r) => r.contentUrl?.startsWith(`storage://${LESSON_MEDIA_BUCKET}/`)),
    rows.map((r) => r.type).join(", "));

  // The instructor can open what they uploaded, before anyone is enrolled.
  const ownView = await builder.request.get(`${BASE}/api/lessons/${pdfLesson}/media`, { maxRedirects: 0 });
  check("the instructor's View link resolves to their file", ownView.status() === 302, `HTTP ${ownView.status()}`);

  // --- publish, enrol, and watch ------------------------------------------------------
  await prisma.course.update({ where: { id: course.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await prisma.enrollment.create({ data: { userId: learner.appUserId, courseId: course.id, status: "ACTIVE" } });

  const player = await learner.context.newPage();
  await player.goto(`${BASE}/student/courses/${course.slug}/lessons/${videoLesson}`, { waitUntil: "load" });
  const html = await player.content();
  check("no expiring storage link is written into the lesson page",
    !html.includes("token=") && !html.includes("/object/sign/"));

  const video = await player.evaluate(async () => {
    const el = document.querySelector("video")!;
    el.muted = true;
    await new Promise<void>((resolve) => {
      if (el.readyState >= 2) return resolve();
      el.addEventListener("loadeddata", () => resolve(), { once: true });
      el.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 20_000);
    });
    await el.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    return { width: el.videoWidth, time: el.currentTime, error: el.error?.code ?? null, src: el.getAttribute("src") };
  });
  check("the enrolled learner's player decodes the uploaded video",
    video.width === 320 && video.error === null, `${video.width}px, error ${video.error}`);
  check("  and it actually plays", video.time > 0.3, `t=${video.time.toFixed(2)}s`);
  check("  from the access-checked route, not a storage URL", video.src === `/api/lessons/${videoLesson}/media`, video.src ?? "");
  await player.screenshot({ path: join(dir, "player-video.png") });

  await player.goto(`${BASE}/student/courses/${course.slug}/lessons/${pdfLesson}`, { waitUntil: "load" });
  const pdfSrc = await player.locator("iframe").getAttribute("src");
  const pdf = await player.request.get(`${BASE}${pdfSrc}`);
  check("the PDF lesson's frame loads the real PDF",
    pdf.ok() && (pdf.headers()["content-type"] ?? "").includes("application/pdf") &&
      (await pdf.body()).subarray(0, 5).toString() === "%PDF-",
    `HTTP ${pdf.status()} ${pdf.headers()["content-type"]}`);
  await player.waitForTimeout(1500);
  await player.screenshot({ path: join(dir, "player-pdf.png") });

  // --- the questions an attacker asks ----------------------------------------------------
  const outsiderPage = await outsider.context.newPage();
  const notEnrolled = await outsiderPage.request.get(`${BASE}/api/lessons/${videoLesson}/media`, { maxRedirects: 0 });
  check("a signed-in learner who has not enrolled gets nothing", notEnrolled.status() === 404, `HTTP ${notEnrolled.status()}`);

  const strangerContext = await browser.newContext();
  const signedOut = await strangerContext.request.get(`${BASE}/api/lessons/${videoLesson}/media`, { maxRedirects: 0 });
  check("a signed-out visitor gets nothing", signedOut.status() === 401, `HTTP ${signedOut.status()}`);
  const cacheHeader = signedOut.headers()["cache-control"] ?? "";
  check("  and the answer is marked not to be cached", cacheHeader.includes("no-store"), cacheHeader);

  const bogus = await player.request.get(`${BASE}/api/lessons/${randomUUID()}/media`, { maxRedirects: 0 });
  check("a made-up lesson id looks the same as a forbidden one", bogus.status() === 404, `HTTP ${bogus.status()}`);

  console.log(`screenshots: ${dir}`);
}

async function cleanup() {
  if (courseId) {
    const lessons = await prisma.lesson.findMany({ where: { module: { courseId } }, select: { contentUrl: true } });
    for (const lesson of lessons) {
      const key = lesson.contentUrl ? lessonMediaKey(lesson.contentUrl) : null;
      if (key) await storage.remove(key).catch(() => {});
    }
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } }).catch(() => {});
  }
  for (const id of authIds) {
    const row = await prisma.user.findFirst({ where: { supabaseUserId: id }, select: { id: true } });
    if (row) {
      await prisma.userRole.deleteMany({ where: { userId: row.id } });
      await prisma.user.delete({ where: { id: row.id } }).catch(() => {});
    }
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await browser?.close();
  await prisma.$disconnect();
}

main()
  .catch((cause) => results.push("FAIL  run aborted — " + (cause instanceof Error ? cause.message : String(cause))))
  .finally(async () => {
    await cleanup();
    console.log(results.join("\n"));
    const failed = results.filter((r) => r.startsWith("FAIL")).length;
    console.log(`\n${results.length - failed}/${results.length} passed against ${BASE}`);
    process.exit(failed ? 1 : 0);
  });
