/**
 * Functional checks for departments and cohorts (PRD §13.3).
 *
 * These describe who works with whom, so the boundaries matter: a department
 * belongs to one organisation and cannot collect outsiders, and an
 * organisation's cohort cannot quietly acquire someone else's staff.
 *
 * The reporting is the point of the feature, so the numbers are checked
 * against known fixtures rather than assumed.
 *
 *   npx tsx scripts/verify-cohorts.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  addCohortMembers,
  assignDepartment,
  createCohort,
  createDepartment,
  deleteDepartment,
  enrolCohort,
  getCohortReport,
  getDepartmentReport,
  listCohorts,
  removeCohortMember,
} from "../lib/cohorts";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgs } } });
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const admin = await prisma.user.create({
    data: { email: `coh-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Coh", lastName: "Admin" } } },
  });
  createdUsers.push(admin.id);

  const teacher = await prisma.user.create({
    data: { email: `coh-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Coh", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const orgA = await prisma.organization.create({
    data: { name: `Acme ${RUN}`, slug: `acme-${RUN}` }, select: { id: true },
  });
  createdOrgs.push(orgA.id);

  const orgB = await prisma.organization.create({
    data: { name: `Other ${RUN}`, slug: `other-${RUN}` }, select: { id: true },
  });
  createdOrgs.push(orgB.id);

  // Three staff at Acme, one at the other organisation.
  const staff = [];
  for (const label of ["one", "two", "three"]) {
    const user = await prisma.user.create({
      data: { email: `coh-${label}-${RUN}@demo.local`, status: "ACTIVE", organizationId: orgA.id,
        profile: { create: { firstName: label, lastName: "Staff" } } },
      select: { id: true },
    });
    createdUsers.push(user.id);
    staff.push(user.id);
  }

  const outsider = await prisma.user.create({
    data: { email: `coh-outsider-${RUN}@demo.local`, status: "ACTIVE", organizationId: orgB.id,
      profile: { create: { firstName: "Out", lastName: "Sider" } } },
    select: { id: true },
  });
  createdUsers.push(outsider.id);

  const course = await prisma.course.create({
    data: { title: `Cohort Course ${RUN}`, slug: `cohort-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 0 },
    select: { id: true },
  });
  createdCourses.push(course.id);

  const draft = await prisma.course.create({
    data: { title: `Draft ${RUN}`, slug: `cohort-draft-${RUN}`, status: "DRAFT",
      instructorId: teacher.id, categoryId: category.id },
    select: { id: true },
  });
  createdCourses.push(draft.id);

  // --- departments --------------------------------------------------------
  const blank = await createDepartment(orgA.id, { name: "  " }, admin.id);
  check("a department needs a name", !blank.ok, blank.ok ? "created!" : blank.detail ?? "");

  const legal = await createDepartment(orgA.id, { name: "Legal", code: "LEG" }, admin.id);
  check("a department is created", legal.ok, legal.ok ? legal.data.id : legal.error);
  if (!legal.ok) return finish();

  const duplicate = await createDepartment(orgA.id, { name: "Legal" }, admin.id);
  check("a duplicate department name is refused in the same organisation",
    !duplicate.ok && duplicate.error === "DUPLICATE", duplicate.ok ? "created!" : duplicate.error);

  const sameNameElsewhere = await createDepartment(orgB.id, { name: "Legal" }, admin.id);
  check("the same name is fine in a different organisation", sameNameElsewhere.ok,
    sameNameElsewhere.ok ? "created" : sameNameElsewhere.error);

  const risk = await createDepartment(orgA.id, { name: "Risk" }, admin.id);
  if (!risk.ok) return finish();

  const assigned = await assignDepartment(staff[0], legal.data.id, admin.id);
  check("a member is assigned to a department", assigned.ok, assigned.ok ? "assigned" : assigned.error);
  await assignDepartment(staff[1], legal.data.id, admin.id);
  await assignDepartment(staff[2], risk.data.id, admin.id);

  const foreign = await assignDepartment(outsider.id, legal.data.id, admin.id);
  check("someone outside the organisation cannot be assigned to its department",
    !foreign.ok && foreign.error === "INVALID", foreign.ok ? "assigned!" : foreign.error);

  // --- cohorts ------------------------------------------------------------
  const cohort = await createCohort(
    { name: `January intake ${RUN}`, organizationId: orgA.id, courseId: course.id,
      startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000) },
    admin.id,
  );
  check("a cohort is created", cohort.ok, cohort.ok ? cohort.data.id : cohort.error);
  if (!cohort.ok) return finish();

  const backwards = await createCohort(
    { name: `Backwards ${RUN}`, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date() },
    admin.id,
  );
  check("a cohort cannot end before it starts", !backwards.ok,
    backwards.ok ? "created!" : backwards.detail ?? "");

  const added = await addCohortMembers(cohort.data.id, staff, admin.id);
  check("members are added to the cohort", added.ok && added.data.added === 3,
    added.ok ? `${added.data.added} added` : added.error);

  const again = await addCohortMembers(cohort.data.id, staff, admin.id);
  check("adding the same people again does nothing",
    again.ok && again.data.added === 0 && again.data.skipped === 3,
    again.ok ? `${again.data.skipped} skipped` : again.error);

  const foreignMember = await addCohortMembers(cohort.data.id, [outsider.id], admin.id);
  check("an outsider cannot join an organisation's cohort",
    foreignMember.ok && foreignMember.data.added === 0,
    foreignMember.ok ? `${foreignMember.data.added} added` : foreignMember.error);

  const memberCount = await prisma.cohortMember.count({ where: { cohortId: cohort.data.id } });
  check("the cohort holds exactly its own members", memberCount === 3, `${memberCount}`);

  // --- enrolling a cohort -------------------------------------------------
  const draftEnrol = await enrolCohort(cohort.data.id, draft.id, admin.id);
  check("a cohort cannot be enrolled into an unpublished course",
    !draftEnrol.ok && draftEnrol.error === "NOT_PUBLISHED",
    draftEnrol.ok ? "enrolled!" : draftEnrol.error);

  const enrolled = await enrolCohort(cohort.data.id, course.id, admin.id);
  check("the whole cohort is enrolled at once",
    enrolled.ok && enrolled.data.enrolled === 3,
    enrolled.ok ? `${enrolled.data.enrolled} enrolled` : enrolled.error);

  const repeat = await enrolCohort(cohort.data.id, course.id, admin.id);
  check("re-enrolling leaves existing enrolments alone",
    repeat.ok && repeat.data.enrolled === 0 && repeat.data.alreadyEnrolled === 3,
    repeat.ok ? `${repeat.data.alreadyEnrolled} already` : repeat.error);

  const enrolmentRows = await prisma.enrollment.count({ where: { courseId: course.id } });
  check("one enrolment per member exists", enrolmentRows === 3, `${enrolmentRows}`);

  const granted = await prisma.enrollment.findFirst({
    where: { courseId: course.id }, select: { enrolledBy: true },
  });
  check("enrolments record who granted them", granted?.enrolledBy === admin.id, "recorded");

  const notified = await prisma.notification.count({
    where: { userId: { in: staff }, title: { contains: "enrolled in" } },
  });
  check("members are told they were enrolled", notified === 3, `${notified}`);

  // --- reporting ----------------------------------------------------------
  await prisma.enrollment.updateMany({
    where: { courseId: course.id, userId: staff[0] },
    data: { status: "COMPLETED", progressPercent: 100, completedAt: new Date() },
  });
  await prisma.enrollment.updateMany({
    where: { courseId: course.id, userId: staff[1] },
    data: { progressPercent: 50 },
  });

  const byDepartment = await getDepartmentReport(orgA.id);
  const legalRow = byDepartment.departments.find((d) => d.name === "Legal");
  check("the department report counts its members", legalRow?.members === 2, `${legalRow?.members}`);
  check("the department report computes completion",
    legalRow?.completed === 1 && legalRow.completionRate === 50,
    `${legalRow?.completed} of ${legalRow?.enrolments}, ${legalRow?.completionRate}%`);
  check("the department report averages progress",
    legalRow?.averageProgress === 75, `${legalRow?.averageProgress}%`);

  const riskRow = byDepartment.departments.find((d) => d.name === "Risk");
  check("a department with no completions reports zero",
    riskRow?.completed === 0 && riskRow.completionRate === 0, `${riskRow?.completionRate}%`);

  const cohortReport = await getCohortReport(cohort.data.id);
  check("the cohort report lists its members", cohortReport?.summary.members === 3,
    `${cohortReport?.summary.members}`);
  check("the cohort report counts who has started",
    cohortReport?.summary.enrolled === 3, `${cohortReport?.summary.enrolled}`);
  check("the cohort report counts completions",
    cohortReport?.summary.completed === 1, `${cohortReport?.summary.completed}`);
  check("the cohort report shows each member's department",
    cohortReport?.members.some((m) => m.department === "Legal") === true, "department shown");

  const listed = await listCohorts(orgA.id);
  check("cohorts are listed for their organisation",
    listed.some((c) => c.id === cohort.data.id), `${listed.length}`);

  // --- removal ------------------------------------------------------------
  const removed = await removeCohortMember(cohort.data.id, staff[2]);
  check("a member can be removed from a cohort", removed.ok, removed.ok ? "removed" : removed.error);

  const stillEnrolled = await prisma.enrollment.count({
    where: { courseId: course.id, userId: staff[2] },
  });
  check("removing from a cohort does not unenrol them", stillEnrolled === 1,
    "enrolment kept");

  const deleted = await deleteDepartment(legal.data.id, admin.id);
  check("a department can be deleted", deleted.ok, deleted.ok ? "deleted" : deleted.error);

  const orphaned = await prisma.user.count({ where: { id: { in: staff }, departmentId: null } });
  check("deleting a department detaches its members rather than deleting them",
    orphaned >= 2, `${orphaned} detached`);

  const survivors = await prisma.user.count({ where: { id: { in: staff } } });
  check("the people themselves survive", survivors === 3, `${survivors}`);

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
