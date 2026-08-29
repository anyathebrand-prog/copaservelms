/**
 * Functional checks for admin approvals and user management (PRD §13).
 *
 * The load-bearing behaviour here is privilege boundaries and the audit trail:
 * who may act on whom, the guards that stop an admin locking themselves or the
 * platform out, and the requirement that every action leaves a record.
 *
 *   LOCAL=postgres://... DATABASE_URL=$LOCAL npx tsx scripts/verify-admin.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { createCourse, addModule, addLesson, setCourseStatus } from "../lib/instructor";
import { getAdminOverview, getAuditLog, getCourseQueue, reviewCourse, setUserRole, setUserStatus } from "../lib/admin";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.LOCAL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/**
 * Accounts this run suspended that it did not create.
 *
 * The last-super-admin scenario needs the fixture to be the only active super
 * admin, which means quieting any others that already exist. Those belong to
 * the database, not to this test, so they are recorded and restored — leaving
 * one suspended locked a real administrator out of the deployed app, and the
 * symptom was an unexplained sign-in loop rather than anything mentioning
 * suspension.
 */
const suspendedByThisRun: string[] = [];

const ADMIN = ["ADMIN"];
const SUPER = ["SUPER_ADMIN"];
const STUDENT = ["STUDENT"];

async function makeUser(label: string, roles: string[]) {
  return prisma.user.create({
    data: {
      email: `${label}-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: label, lastName: "Test" } },
      roles: { create: roles.map((name) => ({ role: { connect: { name: name as never } } })) },
    },
  });
}

/** Remove this run's fixtures, including the courses created for review. */
async function cleanup() {
  // Restore first: if anything below fails, the borrowed accounts are already
  // back rather than left suspended.
  if (suspendedByThisRun.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: suspendedByThisRun } },
      data: { status: "ACTIVE" },
    });
  }

  const users = await prisma.user.findMany({
    where: { email: { contains: `-${RUN}@demo.local` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({ where: { instructorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const admin = await makeUser("admin", ["ADMIN"]);
  const superAdmin = await makeUser("super", ["SUPER_ADMIN"]);
  const instructor = await makeUser("teacher", ["INSTRUCTOR"]);
  const student = await makeUser("learner", ["STUDENT"]);

  // A submitted course to review.
  const created = await createCourse(instructor.id, { title: `Reviewable ${RUN}` });
  if (!created.ok) return finish();
  const courseId = created.data.id;
  const mod = await addModule(courseId, instructor.id, ["INSTRUCTOR"], "M1");
  if (mod.ok) await addLesson(mod.data.id, instructor.id, ["INSTRUCTOR"], { title: "L1", type: "TEXT" });
  await setCourseStatus(courseId, instructor.id, ["INSTRUCTOR"], "SUBMITTED");

  // --- authorisation ------------------------------------------------------
  const studentReview = await reviewCourse(student.id, STUDENT, courseId, "PUBLISH");
  check("student cannot review a course", !studentReview.ok && studentReview.error === "FORBIDDEN",
    studentReview.ok ? "published!" : `error=${studentReview.error}`);

  const studentSuspend = await setUserStatus(student.id, STUDENT, instructor.id, "SUSPENDED");
  check("student cannot suspend a user", !studentSuspend.ok && studentSuspend.error === "FORBIDDEN",
    studentSuspend.ok ? "suspended!" : `error=${studentSuspend.error}`);

  // --- course review ------------------------------------------------------
  const queue = await getCourseQueue("SUBMITTED");
  check("submitted course appears in the queue", queue.some((c) => c.id === courseId), `${queue.length} queued`);

  const rejectNoReason = await reviewCourse(admin.id, ADMIN, courseId, "REJECT");
  check("rejection without a reason is refused", !rejectNoReason.ok && rejectNoReason.error === "INVALID",
    rejectNoReason.ok ? "rejected!" : `error=${rejectNoReason.error}`);

  const rejected = await reviewCourse(admin.id, ADMIN, courseId, "REJECT", "Needs a summative quiz.");
  check("rejection returns the course to draft", rejected.ok && rejected.data.status === "DRAFT",
    rejected.ok ? rejected.data.status : `error=${rejected.error}`);

  // Instructor keeps their work and can resubmit.
  const resubmitted = await setCourseStatus(courseId, instructor.id, ["INSTRUCTOR"], "SUBMITTED");
  check("instructor can resubmit after rejection", resubmitted.ok, resubmitted.ok ? "submitted" : `error=${resubmitted.error}`);

  const published = await reviewCourse(admin.id, ADMIN, courseId, "PUBLISH");
  check("admin publishes a submitted course", published.ok && published.data.status === "PUBLISHED",
    published.ok ? published.data.status : `error=${published.error}`);

  // --- self-protection ----------------------------------------------------
  const selfSuspend = await setUserStatus(admin.id, ADMIN, admin.id, "SUSPENDED");
  check("admin cannot suspend themselves", !selfSuspend.ok && selfSuspend.error === "SELF_TARGET",
    selfSuspend.ok ? "suspended!" : `error=${selfSuspend.error}`);

  const selfDemote = await setUserRole(superAdmin.id, SUPER, superAdmin.id, "SUPER_ADMIN", false);
  check("super admin cannot demote themselves", !selfDemote.ok,
    selfDemote.ok ? "demoted!" : `error=${selfDemote.error}`);

  // --- privilege escalation ----------------------------------------------
  const adminMakesAdmin = await setUserRole(admin.id, ADMIN, student.id, "ADMIN", true);
  check("admin cannot mint another admin", !adminMakesAdmin.ok && adminMakesAdmin.error === "FORBIDDEN",
    adminMakesAdmin.ok ? "granted!" : `error=${adminMakesAdmin.error}`);

  const superMakesAdmin = await setUserRole(superAdmin.id, SUPER, student.id, "ADMIN", true);
  check("super admin can grant admin", superMakesAdmin.ok && superMakesAdmin.data.roles.includes("ADMIN"),
    superMakesAdmin.ok ? superMakesAdmin.data.roles.join(",") : `error=${superMakesAdmin.error}`);

  const adminSuspendsSuper = await setUserStatus(admin.id, ADMIN, superAdmin.id, "SUSPENDED");
  check("admin cannot suspend a super admin", !adminSuspendsSuper.ok && adminSuspendsSuper.error === "FORBIDDEN",
    adminSuspendsSuper.ok ? "suspended!" : `error=${adminSuspendsSuper.error}`);

  // --- instructor approval ------------------------------------------------
  const pending = await prisma.user.create({
    data: {
      email: `applicant-${RUN}@demo.local`,
      status: "PENDING",
      profile: { create: { firstName: "Applicant", lastName: "Test" } },
    },
  });

  const approved = await setUserRole(admin.id, ADMIN, pending.id, "INSTRUCTOR", true);
  check("admin can approve an instructor", approved.ok && approved.data.roles.includes("INSTRUCTOR"),
    approved.ok ? approved.data.roles.join(",") : `error=${approved.error}`);

  const activated = await setUserStatus(admin.id, ADMIN, pending.id, "ACTIVE");
  check("admin can activate a pending user", activated.ok && activated.data.status === "ACTIVE",
    activated.ok ? activated.data.status : `error=${activated.error}`);

  const revoked = await setUserRole(admin.id, ADMIN, pending.id, "INSTRUCTOR", false);
  check("admin can revoke instructor", revoked.ok && !revoked.data.roles.includes("INSTRUCTOR"),
    revoked.ok ? `[${revoked.data.roles.join(",")}]` : `error=${revoked.error}`);

  // --- last super admin ---------------------------------------------------
  // Suspend every other super admin, then confirm the last one is protected.
  const otherSupers = await prisma.user.findMany({
    where: {
      id: { not: superAdmin.id },
      status: "ACTIVE",
      roles: { some: { role: { name: "SUPER_ADMIN" } } },
    },
    select: { id: true },
  });
  for (const other of otherSupers) {
    await prisma.user.update({ where: { id: other.id }, data: { status: "SUSPENDED" } });
    suspendedByThisRun.push(other.id);
  }

  // These assert the self-target guard, which is what actually prevents a
  // lockout. The LAST_SUPER_ADMIN branch is unreachable under current rules —
  // see the note on countActiveSuperAdmins — so no test claims to cover it.
  const lastSuper = await setUserStatus(superAdmin.id, SUPER, superAdmin.id, "SUSPENDED");
  check("a super admin cannot suspend their own account",
    !lastSuper.ok && lastSuper.error === "SELF_TARGET", lastSuper.ok ? "allowed!" : `error=${lastSuper.error}`);

  const otherAdmin = await makeUser("admin2", ["SUPER_ADMIN"]);
  const suspendLast = await setUserStatus(otherAdmin.id, SUPER, superAdmin.id, "SUSPENDED");
  check("a super admin can be suspended while another remains", suspendLast.ok,
    suspendLast.ok ? "suspended" : `error=${suspendLast.error}`);

  const suspendFinal = await prisma.user.updateMany({
    where: { id: { not: otherAdmin.id }, roles: { some: { role: { name: "SUPER_ADMIN" } } } },
    data: { status: "SUSPENDED" },
  });
  const demoteFinal = await setUserRole(otherAdmin.id, SUPER, otherAdmin.id, "SUPER_ADMIN", false);
  check("a super admin cannot demote their own account",
    !demoteFinal.ok && demoteFinal.error === "SELF_TARGET",
    demoteFinal.ok ? "allowed!" : `error=${demoteFinal.error} (${suspendFinal.count} others suspended)`);

  // The invariant that actually matters, however it is enforced.
  const activeSupers = await prisma.user.count({
    where: { status: "ACTIVE", deletedAt: null, roles: { some: { role: { name: "SUPER_ADMIN" } } } },
  });
  check("at least one active super admin survives every operation above",
    activeSupers >= 1, `${activeSupers} active`);

  // --- audit trail --------------------------------------------------------
  const log = await getAuditLog(200);
  const actions = log.map((e) => e.action);

  check("course rejection is audited", actions.includes("course.reject"), `${actions.filter((a) => a.startsWith("course.")).length} course entries`);
  check("course publication is audited", actions.includes("course.publish"), actions.includes("course.publish") ? "logged" : "missing");
  check("role grants are audited", actions.includes("user.role.grant"), actions.includes("user.role.grant") ? "logged" : "missing");
  check("role revocations are audited", actions.includes("user.role.revoke"), actions.includes("user.role.revoke") ? "logged" : "missing");
  check("status changes are audited", actions.some((a) => a.startsWith("user.status.")), "logged");

  const rejectEntry = log.find((e) => e.action === "course.reject");
  const after = rejectEntry?.after as { reason?: string } | null;
  check("rejection reason is captured in the audit entry",
    after?.reason === "Needs a summative quiz.", `${after?.reason}`);

  // Two ADMIN grants were attempted against this run's student: one refused
  // (admin acting) and one allowed (super admin acting). Exactly one should
  // appear. Scoped to this run's user, since the log is append-only and
  // accumulates across runs against the same database.
  const adminGrants = log.filter(
    (e) =>
      e.action === "user.role.grant" &&
      e.entityId === student.id &&
      (e.after as { role?: string })?.role === "ADMIN",
  );
  check("a refused action leaves no audit entry",
    adminGrants.length === 1, `${adminGrants.length} logged for this run's student (1 allowed, 1 refused)`);

  // --- overview -----------------------------------------------------------
  const overview = await getAdminOverview();
  check("overview counts published courses", overview.activeCourses >= 1, `${overview.activeCourses} active`);
  check("overview counts instructors", overview.instructors >= 1, `${overview.instructors} instructors`);

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
