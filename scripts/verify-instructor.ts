/**
 * Functional checks for the instructor course builder (PRD §10).
 *
 * The security-relevant behaviour here is ownership and the publish gate:
 * Prisma bypasses RLS, so both live in lib/instructor.ts rather than in the
 * database, and both need testing directly.
 *
 * Expects a migrated, seeded local database:
 *   LOCAL=postgres://... DATABASE_URL=$LOCAL npx tsx scripts/verify-instructor.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  addLesson,
  addModule,
  createCourse,
  deleteLesson,
  getCourseForEditing,
  getCourseStudents,
  moveLesson,
  moveModule,
  setCourseStatus,
  updateCourseDetails,
} from "../lib/instructor";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.LOCAL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

const INSTRUCTOR = ["INSTRUCTOR"];
const ADMIN = ["ADMIN"];

/**
 * Remove this run's fixtures.
 *
 * Courses cascade to modules, lessons, and enrolments; users are deleted last
 * because courses reference their instructor.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: `-${RUN}@demo.local` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({ where: { instructorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const owner = await prisma.user.create({
    data: {
      email: `owner-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Ada", lastName: "Okafor" } },
      roles: { create: { role: { connect: { name: "INSTRUCTOR" } } } },
    },
  });

  const rival = await prisma.user.create({
    data: {
      email: `rival-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Rival", lastName: "Instructor" } },
      roles: { create: { role: { connect: { name: "INSTRUCTOR" } } } },
    },
  });

  // --- creation -----------------------------------------------------------
  const created = await createCourse(owner.id, { title: `Governance Essentials ${RUN}` });
  check("course created as draft", created.ok, created.ok ? created.data.id : `error=${created.error}`);
  if (!created.ok) return finish();

  const courseId = created.data.id;
  const draft = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  check("new course starts in DRAFT", draft.status === "DRAFT", `status=${draft.status}`);
  check("slug generated from title", draft.slug.startsWith("governance-essentials"), draft.slug);

  // Two courses with the same title must not collide on the unique slug.
  const twin = await createCourse(owner.id, { title: `Governance Essentials ${RUN}` });
  const twinSlug = twin.ok
    ? (await prisma.course.findUniqueOrThrow({ where: { id: twin.data.id } })).slug
    : "";
  check("duplicate titles get distinct slugs", twin.ok && twinSlug !== draft.slug, twinSlug);

  // --- ownership ----------------------------------------------------------
  const rivalView = await getCourseForEditing(courseId, rival.id, INSTRUCTOR);
  check("another instructor cannot open the course", rivalView === null, rivalView === null ? "null" : "leaked");

  const rivalEdit = await updateCourseDetails(courseId, rival.id, INSTRUCTOR, { title: "Hijacked" });
  check("another instructor cannot edit", !rivalEdit.ok && rivalEdit.error === "NOT_FOUND",
    rivalEdit.ok ? "edited!" : `error=${rivalEdit.error}`);

  const adminView = await getCourseForEditing(courseId, rival.id, ADMIN);
  check("admin can open any course", adminView !== null, adminView ? "loaded" : "null");

  // --- curriculum ---------------------------------------------------------
  const moduleA = await addModule(courseId, owner.id, INSTRUCTOR, "Module A");
  const moduleB = await addModule(courseId, owner.id, INSTRUCTOR, "Module B");
  check("modules append in order", moduleA.ok && moduleB.ok, "2 modules");
  if (!moduleA.ok || !moduleB.ok) return finish();

  const rivalModule = await addModule(courseId, rival.id, INSTRUCTOR, "Sneaky");
  check("another instructor cannot add a module", !rivalModule.ok, rivalModule.ok ? "added!" : `error=${rivalModule.error}`);

  for (const title of ["Lesson 1", "Lesson 2", "Lesson 3"]) {
    await addLesson(moduleA.data.id, owner.id, INSTRUCTOR, { title, type: "TEXT" });
  }

  let course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  check("lessons appended in order",
    course!.modules[0].lessons.map((l) => l.title).join(",") === "Lesson 1,Lesson 2,Lesson 3",
    course!.modules[0].lessons.map((l) => l.position).join(","));

  // Reordering must survive the (moduleId, position) unique constraint.
  const third = course!.modules[0].lessons[2];
  await moveLesson(third.id, owner.id, INSTRUCTOR, "up");
  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  check("lesson moves up without constraint violation",
    course!.modules[0].lessons.map((l) => l.title).join(",") === "Lesson 1,Lesson 3,Lesson 2",
    course!.modules[0].lessons.map((l) => l.title).join(","));

  const first = course!.modules[0].lessons[0];
  const noop = await moveLesson(first.id, owner.id, INSTRUCTOR, "up");
  check("moving the first lesson up is a no-op, not an error", noop.ok, noop.ok ? "ok" : `error=${noop.error}`);

  await moveModule(course!.modules[1].id, owner.id, INSTRUCTOR, "up");
  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  check("module reorder swaps positions",
    course!.modules[0].title === "Module B" && course!.modules[0].position === 1,
    course!.modules.map((m) => `${m.position}:${m.title}`).join(", "));

  // Deleting must compact positions, or the next append collides.
  const moduleWithLessons = course!.modules.find((m) => m.lessons.length === 3)!;
  await deleteLesson(moduleWithLessons.lessons[0].id, owner.id, INSTRUCTOR);
  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  const compacted = course!.modules.find((m) => m.id === moduleWithLessons.id)!;
  check("delete compacts remaining positions",
    compacted.lessons.map((l) => l.position).join(",") === "1,2",
    compacted.lessons.map((l) => l.position).join(","));

  const appended = await addLesson(moduleWithLessons.id, owner.id, INSTRUCTOR, { title: "Lesson 4", type: "TEXT" });
  check("append after delete does not collide", appended.ok, appended.ok ? "appended" : `error=${appended.error}`);

  // Deleting from the middle is the case that exposed an ordering-dependent
  // unique-constraint collision: compaction shifts several rows down at once,
  // and a plain decrement fails whenever the database updates a higher row
  // before the one below it has vacated its position.
  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  const compactModule = course!.modules.find((m) => m.lessons.length >= 3)!;
  for (const title of ["Lesson 5", "Lesson 6"]) {
    await addLesson(compactModule.id, owner.id, INSTRUCTOR, { title, type: "TEXT" });
  }
  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  const before = course!.modules.find((m) => m.id === compactModule.id)!;
  const middle = before.lessons[1];

  const middleDelete = await deleteLesson(middle.id, owner.id, INSTRUCTOR);
  check("deleting from the middle of a module succeeds", middleDelete.ok,
    middleDelete.ok ? "deleted" : `error=${middleDelete.error}`);

  course = await getCourseForEditing(courseId, owner.id, INSTRUCTOR);
  const after = course!.modules.find((m) => m.id === compactModule.id)!;
  const positions = after.lessons.map((l) => l.position);
  check("positions stay contiguous from 1 after a middle delete",
    positions.join(",") === positions.map((_, i) => i + 1).join(","),
    positions.join(","));
  check("no lesson was lost in compaction", after.lessons.length === before.lessons.length - 1,
    `${before.lessons.length} → ${after.lessons.length}`);

  // --- publish workflow ---------------------------------------------------
  const selfPublish = await setCourseStatus(courseId, owner.id, INSTRUCTOR, "PUBLISHED");
  check("instructor cannot self-publish", !selfPublish.ok && selfPublish.error === "FORBIDDEN",
    selfPublish.ok ? "published!" : `error=${selfPublish.error}`);

  const selfApprove = await setCourseStatus(courseId, owner.id, INSTRUCTOR, "APPROVED");
  check("instructor cannot self-approve", !selfApprove.ok, selfApprove.ok ? "approved!" : `error=${selfApprove.error}`);

  const emptyCourse = await createCourse(owner.id, { title: `Empty ${RUN}` });
  const submitEmpty = emptyCourse.ok
    ? await setCourseStatus(emptyCourse.data.id, owner.id, INSTRUCTOR, "SUBMITTED")
    : { ok: true as const };
  check("empty course cannot be submitted", !submitEmpty.ok, submitEmpty.ok ? "submitted!" : "refused");

  const submitted = await setCourseStatus(courseId, owner.id, INSTRUCTOR, "SUBMITTED");
  check("course with lessons submits for review", submitted.ok && submitted.data.status === "SUBMITTED",
    submitted.ok ? submitted.data.status : `error=${submitted.error}`);

  // --- edit lock ----------------------------------------------------------
  const lockedEdit = await addModule(courseId, owner.id, INSTRUCTOR, "After submission");
  check("curriculum locked while under review", !lockedEdit.ok && lockedEdit.error === "LOCKED",
    lockedEdit.ok ? "edited!" : `error=${lockedEdit.error}`);

  const adminPublish = await setCourseStatus(courseId, rival.id, ADMIN, "PUBLISHED");
  check("admin can publish", adminPublish.ok && adminPublish.data.status === "PUBLISHED",
    adminPublish.ok ? adminPublish.data.status : `error=${adminPublish.error}`);

  const published = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  check("publishedAt stamped on publish", published.publishedAt !== null, `${published.publishedAt}`);

  const withdraw = await setCourseStatus(courseId, owner.id, INSTRUCTOR, "DRAFT");
  check("owner can withdraw a live course to draft", withdraw.ok, withdraw.ok ? "draft" : `error=${withdraw.error}`);

  const unlockedEdit = await addModule(courseId, owner.id, INSTRUCTOR, "After withdrawal");
  check("curriculum editable again once back in draft", unlockedEdit.ok,
    unlockedEdit.ok ? "added" : `error=${unlockedEdit.error}`);

  // --- student roster -----------------------------------------------------
  const rivalRoster = await getCourseStudents(courseId, rival.id, INSTRUCTOR);
  check("another instructor cannot see the roster", rivalRoster === null, rivalRoster === null ? "null" : "leaked");

  const ownRoster = await getCourseStudents(courseId, owner.id, INSTRUCTOR);
  check("owner sees an empty roster", Array.isArray(ownRoster) && ownRoster.length === 0, `${ownRoster?.length}`);

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
