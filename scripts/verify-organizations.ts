/**
 * Functional checks for corporate accounts and bulk enrolment (PRD §13.2, §13.3).
 *
 * The critical case is the pre-provisioned user: bulk enrolment creates accounts
 * for people who have never signed in, and the auth trigger must *claim* those
 * rows at signup rather than collide with them. That path runs against real
 * Supabase Auth here, because it is the one that breaks silently — a colliding
 * trigger makes signup fail for exactly the users an enterprise deal just paid
 * for, and no unit test of our own code would notice.
 *
 *   npx tsx scripts/verify-organizations.ts
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { addMembers, bulkEnrol, createOrganization, getOrganization, removeMember } from "../lib/organizations";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdOrgs: string[] = [];
const createdCourses: string[] = [];
const authUserIds: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: `-${RUN}@` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: [...ids, ...createdOrgs, ...createdCourses] } }] },
  });
  await prisma.consentLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgs } } });

  for (const id of authUserIds) {
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `org-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Org", lastName: "Teacher" } } },
  });

  const admin = await prisma.user.create({
    data: { email: `org-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Org", lastName: "Admin" } } },
  });

  const course = await prisma.course.create({
    data: { title: `Corporate Course ${RUN}`, slug: `corporate-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 0 },
    select: { id: true },
  });
  createdCourses.push(course.id);

  const draftCourse = await prisma.course.create({
    data: { title: `Draft Corporate ${RUN}`, slug: `draft-corporate-${RUN}`, status: "DRAFT",
      instructorId: teacher.id, categoryId: category.id },
    select: { id: true },
  });
  createdCourses.push(draftCourse.id);

  // --- organisation -------------------------------------------------------
  const org = await createOrganization({ name: `Acme Bank ${RUN}`, contactEmail: "hr@acme.test" }, admin.id);
  check("creates an organisation", org.ok, org.ok ? org.id : org.error);
  if (!org.ok) return finish();
  createdOrgs.push(org.id);

  const duplicate = await createOrganization({ name: `Acme Bank ${RUN}` }, admin.id);
  check("refuses a duplicate organisation name", !duplicate.ok && duplicate.error === "DUPLICATE",
    duplicate.ok ? "created!" : duplicate.error);

  const blank = await createOrganization({ name: "   " }, admin.id);
  check("refuses a blank name", !blank.ok, blank.ok ? "created!" : blank.error);

  // --- member import ------------------------------------------------------
  const staffEmail = `staff-${RUN}@example.com`;
  const added = await addMembers(
    org.id,
    `${staffEmail}, second-${RUN}@example.com\nthird-${RUN}@example.com; not-an-email`,
    admin.id,
  );
  check("imports a pasted list on mixed separators",
    added.ok && added.result.created.length === 3, added.ok ? `${added.result.created.length} created` : "failed");
  check("rejects malformed addresses rather than creating them",
    added.ok && added.result.invalid.length === 1 && added.result.invalid[0] === "not-an-email",
    added.ok ? added.result.invalid.join(",") : "");

  const reAdded = await addMembers(org.id, staffEmail, admin.id);
  check("re-adding an existing address links rather than duplicating",
    reAdded.ok && reAdded.result.linked.length === 1 && reAdded.result.created.length === 0,
    reAdded.ok ? `${reAdded.result.linked.length} linked` : "failed");

  const total = await prisma.user.count({ where: { organizationId: org.id } });
  check("no duplicate accounts were created", total === 3, `${total} member(s)`);

  const provisioned = await prisma.user.findUniqueOrThrow({
    where: { email: staffEmail },
    select: { status: true, supabaseUserId: true, roles: { select: { role: { select: { name: true } } } } },
  });
  check("imported members are PENDING with no auth link",
    provisioned.status === "PENDING" && provisioned.supabaseUserId === null,
    `${provisioned.status}`);
  check("imported members still get the STUDENT role",
    provisioned.roles.some((r) => r.role.name === "STUDENT"), "STUDENT");

  // --- bulk enrolment -----------------------------------------------------
  const draftEnrol = await bulkEnrol(org.id, draftCourse.id, admin.id);
  check("cannot bulk enrol into an unpublished course",
    !draftEnrol.ok && draftEnrol.error === "NOT_PUBLISHED",
    draftEnrol.ok ? "enrolled!" : draftEnrol.error);

  const enrolled = await bulkEnrol(org.id, course.id, admin.id);
  check("enrols every member", enrolled.ok && enrolled.result.enrolled.length === 3,
    enrolled.ok ? `${enrolled.result.enrolled.length} enrolled` : "failed");

  const again = await bulkEnrol(org.id, course.id, admin.id);
  check("re-running does not double-enrol",
    again.ok && again.result.enrolled.length === 0 && again.result.alreadyEnrolled.length === 3,
    again.ok ? `${again.result.alreadyEnrolled.length} already enrolled` : "failed");

  const enrolmentRows = await prisma.enrollment.count({ where: { courseId: course.id } });
  check("exactly one enrolment per member exists", enrolmentRows === 3, `${enrolmentRows} row(s)`);

  const granted = await prisma.enrollment.findFirst({
    where: { courseId: course.id },
    select: { enrolledBy: true },
  });
  check("enrolments record who granted them", granted?.enrolledBy === admin.id, `${granted?.enrolledBy === admin.id}`);

  // --- the trigger: a pre-provisioned user signs up -----------------------
  const { data: signUp, error: signUpError } = await supabase.auth.admin.createUser({
    email: staffEmail,
    password: `Corp-${RUN}-Passw0rd!`,
    email_confirm: true,
    user_metadata: { first_name: "Ngozi", last_name: "Bello" },
  });

  check("a pre-provisioned user can sign up at all", !signUpError && signUp?.user != null,
    signUpError ? signUpError.message : "signed up");

  if (signUp?.user) {
    authUserIds.push(signUp.user.id);
    await new Promise((r) => setTimeout(r, 1500));

    const claimed = await prisma.user.findUnique({
      where: { email: staffEmail },
      select: {
        id: true, status: true, supabaseUserId: true,
        profile: { select: { firstName: true, lastName: true } },
        enrollments: { select: { courseId: true } },
      },
    });

    check("signup claims the existing row rather than creating a second",
      claimed?.supabaseUserId === signUp.user.id, `${claimed?.supabaseUserId === signUp.user.id}`);
    check("claiming activates the pending account", claimed?.status === "ACTIVE", `${claimed?.status}`);
    check("the enrolment granted before signup survives",
      claimed?.enrollments.some((e) => e.courseId === course.id) === true,
      `${claimed?.enrollments.length} enrolment(s)`);
    check("the real name from signup replaces the import placeholder",
      claimed?.profile?.firstName === "Ngozi" && claimed.profile.lastName === "Bello",
      `${claimed?.profile?.firstName} ${claimed?.profile?.lastName}`);

    const accounts = await prisma.user.count({ where: { email: staffEmail } });
    check("only one account exists for that address", accounts === 1, `${accounts}`);
  }

  // --- reporting ----------------------------------------------------------
  const report = await getOrganization(org.id);
  check("reporting counts members and enrolments",
    report?.summary.members === 3 && report.summary.enrolments === 3,
    `${report?.summary.members} members, ${report?.summary.enrolments} enrolments`);
  check("reporting distinguishes onboarded from imported",
    report?.summary.onboarded === 1, `${report?.summary.onboarded} onboarded of 3`);

  // --- removal ------------------------------------------------------------
  const removed = await removeMember(org.id, report!.memberships[0].id, admin.id);
  check("removes a member from the organisation", removed.ok, removed.ok ? "removed" : removed.error);

  const stillExists = await prisma.user.findUnique({
    where: { id: report!.memberships[0].id },
    select: { organizationId: true, enrollments: { select: { id: true } } },
  });
  check("removal detaches but does not delete the account or its learning",
    stillExists !== null && stillExists.organizationId === null && stillExists.enrollments.length === 1,
    `org=${stillExists?.organizationId}, enrolments=${stillExists?.enrollments.length}`);

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
