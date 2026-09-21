/**
 * Functional checks for lesson uploads — the videos, PDFs and audio a course
 * is made of.
 *
 * Unlike banners, these are the paid content itself, so the properties worth
 * proving are about who can reach them: only the owner can upload, an upload
 * can only land on its own lesson, the bucket gives nothing away without a
 * signature, and a learner gets a file only while enrolled. Then the
 * housekeeping that keeps storage from filling with orphans.
 *
 * The upload itself is sent exactly as the browser control sends it — a raw
 * PUT to the signed URL with the same headers — so this exercises the real
 * path through storage rather than a server-side shortcut.
 *
 * Runs against real storage and the real database, and removes what it creates.
 *
 *   npx tsx --env-file=.env scripts/verify-lesson-media.ts
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  attachLessonUpload,
  deleteLesson,
  deleteModule,
  lessonMediaForViewer,
  prepareLessonUpload,
  removeLessonUpload,
  updateLesson,
} from "../lib/instructor";
import { lessonMediaKey, lessonMediaMaxBytes, signLessonMediaView } from "../lib/lesson-media";
import { LESSON_MEDIA_BUCKET, getStorage } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const storage = getStorage(LESSON_MEDIA_BUCKET);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];
const courses: string[] = [];

function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

async function makeUser(label: string, role: string | null) {
  const user = await prisma.user.create({
    data: {
      email: `lessonmedia-${label}-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: label, lastName: "Person" } },
    },
    select: { id: true },
  });
  users.push(user.id);
  if (role) {
    const found = await prisma.role.findUnique({ where: { name: role as never }, select: { id: true } });
    if (found) await prisma.userRole.create({ data: { userId: user.id, roleId: found.id } });
  }
  return user.id;
}

async function pdfBytes(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  page.drawText(text, { x: 30, y: 100, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  return doc.save();
}

/** Exactly what components/instructor/lesson-upload.tsx sends. */
async function browserPut(url: string, body: Uint8Array, contentType: string) {
  return fetch(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "cache-control": "max-age=3600",
      "x-upsert": "false",
      apikey: ANON_KEY,
    },
    body: body as BodyInit,
  });
}

async function uploadPdf(lessonId: string, owner: string, text: string) {
  const bytes = await pdfBytes(text);
  const prepared = await prepareLessonUpload(lessonId, owner, ["INSTRUCTOR"], {
    name: `${text}.pdf`,
    type: "application/pdf",
    size: bytes.length,
  });
  if (!prepared.ok) throw new Error("prepare failed: " + prepared.error);
  const put = await browserPut(prepared.data.url, bytes, "application/pdf");
  if (!put.ok) throw new Error("PUT failed: " + put.status + " " + (await put.text()));
  const attached = await attachLessonUpload(lessonId, owner, ["INSTRUCTOR"], prepared.data.key);
  if (!attached.ok) throw new Error("attach failed: " + attached.error);
  return prepared.data.key;
}

async function main() {
  const owner = await makeUser("owner", "INSTRUCTOR");
  const stranger = await makeUser("stranger", "INSTRUCTOR");
  const admin = await makeUser("admin", "ADMIN");
  const learner = await makeUser("learner", "STUDENT");
  const outsider = await makeUser("outsider", "STUDENT");

  const category = await prisma.category.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      title: `Lesson media ${RUN}`,
      slug: `lesson-media-${RUN}`,
      status: "DRAFT",
      instructorId: owner,
      categoryId: category.id,
      priceMinor: 0,
      modules: {
        create: [
          {
            title: "Module one",
            position: 1,
            lessons: {
              create: [
                { title: "Reading", type: "PDF", position: 1 },
                { title: "Second reading", type: "PDF", position: 2 },
              ],
            },
          },
          { title: "Module two", position: 2, lessons: { create: [{ title: "Doomed", type: "PDF", position: 1 }] } },
        ],
      },
    },
    select: { id: true, modules: { orderBy: { position: "asc" }, select: { id: true, lessons: { orderBy: { position: "asc" }, select: { id: true } } } } },
  });
  courses.push(course.id);
  const [lessonA, lessonB] = course.modules[0].lessons.map((l) => l.id);
  const doomedModule = course.modules[1].id;
  const doomedLesson = course.modules[1].lessons[0].id;

  await prisma.enrollment.create({ data: { userId: learner, courseId: course.id, status: "ACTIVE" } });

  const small = { name: "notes.pdf", type: "application/pdf", size: 1000 };

  // --- who may upload ----------------------------------------------------------
  const byStranger = await prepareLessonUpload(lessonA, stranger, ["INSTRUCTOR"], small);
  check("another instructor cannot upload to your lesson",
    !byStranger.ok && byStranger.error === "NOT_FOUND", byStranger.ok ? "signed!" : byStranger.error);

  const byLearner = await prepareLessonUpload(lessonA, learner, ["STUDENT"], small);
  check("an enrolled learner cannot upload either", !byLearner.ok, byLearner.ok ? "signed!" : byLearner.error);

  // --- what may be uploaded ------------------------------------------------------
  const html = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], { name: "x.html", type: "text/html", size: 100 });
  check("HTML is refused before anything is signed",
    !html.ok && html.error === "UNSUPPORTED_TYPE", html.ok ? "signed!" : html.error);

  const max = await lessonMediaMaxBytes();
  const huge = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], { name: "big.mp4", type: "video/mp4", size: max + 1 });
  check(`a file over the ${Math.round(max / 1048576)}MB limit is refused, and the limit is reported`,
    !huge.ok && huge.error === "TOO_LARGE" && huge.maxBytes === max, huge.ok ? "signed!" : `${huge.error} ${huge.maxBytes}`);

  const empty = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], { ...small, size: 0 });
  check("an empty file is refused", !empty.ok && empty.error === "EMPTY", empty.ok ? "signed!" : empty.error);

  // --- the key is the server's, not the uploader's -----------------------------------
  const hostileName = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], {
    name: "../../../other-course/Evil File!!.pdf",
    type: "application/pdf",
    size: 1000,
  });
  check("a hostile file name cannot steer the key",
    hostileName.ok &&
      hostileName.data.key.startsWith(`courses/${course.id}/lessons/${lessonA}/`) &&
      !hostileName.data.key.includes("..") &&
      hostileName.data.key.endsWith("-other-course-evil-file.pdf"),
    hostileName.ok ? hostileName.data.key.split("/").pop() : "refused");

  // --- the bucket is the second lock ------------------------------------------------
  // Sign as a PDF, then send HTML to the same URL. The server's check has
  // passed by then; only the bucket's own type list stands in the way.
  const lying = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], small);
  if (lying.ok) {
    const put = await browserPut(lying.data.url, new TextEncoder().encode("<script>alert(1)</script>"), "text/html");
    check("storage itself refuses a type the bucket does not allow", !put.ok, `HTTP ${put.status}`);
    const attach = await attachLessonUpload(lessonA, owner, ["INSTRUCTOR"], lying.data.key);
    check("and there is then nothing to attach", !attach.ok && attach.error === "MISSING", attach.ok ? "attached!" : attach.error);
  }

  // --- the happy path ----------------------------------------------------------------
  const keyA = await uploadPdf(lessonA, owner, "first-version");
  const rowA = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonA }, select: { contentUrl: true, type: true } });
  check("the owner can upload, and the lesson stores a reference, not a URL",
    rowA.contentUrl === `storage://${LESSON_MEDIA_BUCKET}/${keyA}` && !rowA.contentUrl!.includes("http"),
    rowA.contentUrl ?? "null");
  check("and the lesson's type follows the file", rowA.type === "PDF", rowA.type);

  // A signed upload URL is good for one file.
  const reuse = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], small);
  if (reuse.ok) {
    const first = await browserPut(reuse.data.url, await pdfBytes("one"), "application/pdf");
    const second = await browserPut(reuse.data.url, await pdfBytes("two"), "application/pdf");
    check("a signed upload URL cannot overwrite what it already wrote", first.ok && !second.ok,
      `first ${first.status}, second ${second.status}`);
    await storage.remove(reuse.data.key).catch(() => {});
  }

  // --- the bucket is private ----------------------------------------------------------
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${LESSON_MEDIA_BUCKET}/${keyA}`;
  const asPublic = await fetch(publicUrl);
  check("the file is not reachable at a public URL", !asPublic.ok, `HTTP ${asPublic.status}`);

  const asAnon = await fetch(`${SUPABASE_URL}/storage/v1/object/${LESSON_MEDIA_BUCKET}/${keyA}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
  });
  check("nor with the public anon key", !asAnon.ok, `HTTP ${asAnon.status}`);

  const signed = await fetch(await signLessonMediaView(keyA));
  const bytes = new Uint8Array(await signed.arrayBuffer());
  check("a signed viewing URL serves the real PDF",
    signed.ok && (signed.headers.get("content-type") ?? "").includes("application/pdf") &&
      new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-",
    `${signed.status} ${signed.headers.get("content-type")}`);

  // --- who may view ------------------------------------------------------------------
  const view = async (userId: string, roles: string[]) => (await lessonMediaForViewer(lessonA, userId, roles)).ok;
  check("an enrolled learner can view", await view(learner, ["STUDENT"]));
  check("a learner who is not enrolled cannot", !(await view(outsider, ["STUDENT"])));
  check("the course's instructor can (to check their upload)", await view(owner, ["INSTRUCTOR"]));
  check("another instructor cannot", !(await view(stranger, ["INSTRUCTOR"])));
  check("an admin can", await view(admin, ["ADMIN"]));

  for (const status of ["CANCELLED", "EXPIRED"] as const) {
    await prisma.enrollment.updateMany({ where: { userId: learner, courseId: course.id }, data: { status } });
    check(`an enrolment marked ${status.toLowerCase()} loses access at once`, !(await view(learner, ["STUDENT"])));
  }
  await prisma.enrollment.updateMany({ where: { userId: learner, courseId: course.id }, data: { status: "ACTIVE" } });

  // --- a reference cannot be typed in -------------------------------------------------
  const forged = await updateLesson(lessonB, owner, ["INSTRUCTOR"], { contentUrl: rowA.contentUrl });
  check("pasting another lesson's reference into the link field is refused",
    !forged.ok && forged.error === "INVALID", forged.ok ? "accepted!" : forged.error);

  const crossAttach = await attachLessonUpload(lessonB, owner, ["INSTRUCTOR"], keyA);
  check("attaching another lesson's upload by key is refused",
    !crossAttach.ok && crossAttach.error === "FORBIDDEN", crossAttach.ok ? "attached!" : crossAttach.error);

  // --- ordinary edits leave the file alone ---------------------------------------------
  await updateLesson(lessonA, owner, ["INSTRUCTOR"], { title: "Reading (renamed)", type: "VIDEO" });
  const afterEdit = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonA }, select: { contentUrl: true, type: true, title: true } });
  check("saving the lesson form keeps the file", afterEdit.contentUrl === rowA.contentUrl && afterEdit.title === "Reading (renamed)");
  check("and a PDF cannot be relabelled as a video while attached", afterEdit.type === "PDF", afterEdit.type);

  // --- replacing, removing, deleting ---------------------------------------------------
  const keyA2 = await uploadPdf(lessonA, owner, "second-version");
  check("a file can be replaced", keyA2 !== keyA);
  check("and the replaced file is deleted from storage", (await storage.stat(keyA)) === null);

  await updateLesson(lessonA, owner, ["INSTRUCTOR"], { contentUrl: "https://example.com/elsewhere.pdf" });
  check("swapping the upload for a pasted link deletes the upload", (await storage.stat(keyA2)) === null);

  const keyB = await uploadPdf(lessonB, owner, "lesson-b");
  const removed = await removeLessonUpload(lessonB, owner, ["INSTRUCTOR"]);
  const rowB = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonB }, select: { contentUrl: true } });
  check("removing a file clears the lesson and deletes it",
    removed.ok && rowB.contentUrl === null && (await storage.stat(keyB)) === null);

  const keyB2 = await uploadPdf(lessonB, owner, "lesson-b-again");
  await deleteLesson(lessonB, owner, ["INSTRUCTOR"]);
  check("deleting a lesson deletes its file", (await storage.stat(keyB2)) === null);

  const keyDoomed = await uploadPdf(doomedLesson, owner, "doomed");
  await deleteModule(doomedModule, owner, ["INSTRUCTOR"]);
  check("deleting a module deletes its lessons' files", (await storage.stat(keyDoomed)) === null);

  // --- a live course is locked ----------------------------------------------------------
  await prisma.course.update({ where: { id: course.id }, data: { status: "PUBLISHED" } });
  const whileLive = await prepareLessonUpload(lessonA, owner, ["INSTRUCTOR"], small);
  check("no uploads to a live course without withdrawing it first",
    !whileLive.ok && whileLive.error === "LOCKED", whileLive.ok ? "signed!" : whileLive.error);

  await finish();
}

async function finish() {
  // Anything left under the test course's prefix, however the run ended.
  for (const courseId of courses) {
    const lessons = await prisma.lesson.findMany({ where: { module: { courseId } }, select: { contentUrl: true } });
    for (const lesson of lessons) {
      const key = lesson.contentUrl ? lessonMediaKey(lesson.contentUrl) : null;
      if (key) await storage.remove(key).catch(() => {});
    }
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } }).catch(() => {});
  }
  for (const userId of users) {
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (cause) => {
  console.error(cause);
  results.push("FAIL  run aborted — " + (cause instanceof Error ? cause.message : String(cause)));
  await finish();
});
