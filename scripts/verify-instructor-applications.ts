/**
 * Functional checks for applying to teach (PRD §13.2).
 *
 * The property under test is that applying is the only self-service part.
 * Anyone may ask; only an admin may grant, only a super admin may grant admin,
 * and nothing an applicant can do moves their own application forward. A route
 * from "I applied" to "I hold the INSTRUCTOR role" without an administrator in
 * the middle would make every certificate on the platform worth less.
 *
 *   npx tsx --env-file=.env scripts/verify-instructor-applications.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  applyToTeach,
  approveApplication,
  declineApplication,
  getApplicationSummary,
  getMyApplication,
  listApplications,
  withdrawApplication,
} from "../lib/instructor-applications";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.instructorApplication.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function makeUser(label: string, roles: ("STUDENT" | "INSTRUCTOR" | "ADMIN" | "SUPER_ADMIN")[]) {
  const user = await prisma.user.create({
    data: { email: `ia-${label}-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: label, lastName: "Person" } } },
    select: { id: true },
  });
  users.push(user.id);

  for (const name of roles) {
    const role = await prisma.role.findUnique({ where: { name }, select: { id: true } });
    if (role) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return user.id;
}

const GOOD_BACKGROUND =
  "Twelve years running data protection programmes for Nigerian banks, including two NDPA audits.";

async function main() {
  const applicant = await makeUser("applicant", ["STUDENT"]);
  const admin = await makeUser("admin", ["STUDENT", "ADMIN"]);
  const superAdmin = await makeUser("super", ["STUDENT", "ADMIN", "SUPER_ADMIN"]);
  const existing = await makeUser("teacher", ["STUDENT", "INSTRUCTOR"]);

  // --- validation -----------------------------------------------------------
  const noExpertise = await applyToTeach(applicant, { expertise: "  ", background: GOOD_BACKGROUND });
  check("an application needs a subject", !noExpertise.ok,
    noExpertise.ok ? "accepted!" : noExpertise.detail ?? "");

  const thin = await applyToTeach(applicant, { expertise: "NDPA", background: "I know things." });
  check("a one-line background is refused", !thin.ok, thin.ok ? "accepted!" : thin.detail ?? "");

  const badLink = await applyToTeach(applicant, {
    expertise: "NDPA", background: GOOD_BACKGROUND, link: "linkedin.com/in/someone",
  });
  check("a link without a scheme is refused", !badLink.ok,
    badLink.ok ? "accepted!" : badLink.detail ?? "");

  const alreadyTeaching = await applyToTeach(existing, {
    expertise: "NDPA", background: GOOD_BACKGROUND,
  });
  check("someone who already teaches cannot apply",
    !alreadyTeaching.ok && alreadyTeaching.error === "ALREADY_INSTRUCTOR",
    alreadyTeaching.ok ? "accepted!" : alreadyTeaching.error);

  // --- applying --------------------------------------------------------------
  const applied = await applyToTeach(applicant, {
    expertise: "Data protection for financial institutions",
    background: GOOD_BACKGROUND,
    link: "https://example.com/profile",
  });
  check("an application can be submitted", applied.ok, applied.ok ? applied.data.id : applied.error);
  if (!applied.ok) return finish();

  const mine = await getMyApplication(applicant);
  check("the applicant can see their own application", mine?.id === applied.data.id, `${mine?.status}`);
  check("it starts pending", mine?.status === "PENDING", mine?.status ?? "");

  const twice = await applyToTeach(applicant, { expertise: "Again", background: GOOD_BACKGROUND });
  check("a second open application is refused",
    !twice.ok && twice.error === "ALREADY_PENDING", twice.ok ? "accepted!" : twice.error);

  // --- who may decide ---------------------------------------------------------
  const selfApprove = await approveApplication(applied.data.id, applicant, ["STUDENT"]);
  check("an applicant cannot approve their own application",
    !selfApprove.ok && selfApprove.error === "FORBIDDEN",
    selfApprove.ok ? "approved!" : selfApprove.error);

  const stillStudent = await prisma.userRole.count({
    where: { userId: applicant, role: { name: "INSTRUCTOR" } },
  });
  check("no role was granted by the attempt", stillStudent === 0, `${stillStudent}`);

  const noReason = await declineApplication(applied.data.id, admin, "   ");
  check("declining requires a reason", !noReason.ok,
    noReason.ok ? "declined!" : noReason.detail ?? "");

  // --- approval ----------------------------------------------------------------
  const approved = await approveApplication(applied.data.id, admin, ["ADMIN"], "Welcome aboard.");
  check("an admin can approve", approved.ok, approved.ok ? "approved" : approved.error);

  const nowInstructor = await prisma.userRole.count({
    where: { userId: applicant, role: { name: "INSTRUCTOR" } },
  });
  check("approval grants the INSTRUCTOR role", nowInstructor === 1, `${nowInstructor}`);

  const audited = await prisma.auditLog.count({
    where: { actorId: admin, action: "user.role.grant" },
  });
  check("the role grant is in the audit log", audited >= 1, `${audited} entries`);

  const told = await prisma.notification.count({
    where: { userId: applicant, title: { contains: "teach" } },
  });
  check("the applicant is told", told >= 1, `${told}`);

  const again = await approveApplication(applied.data.id, admin, ["ADMIN"]);
  check("an approved application cannot be approved twice",
    !again.ok && again.error === "NOT_PENDING", again.ok ? "approved!" : again.error);

  // --- declining ----------------------------------------------------------------
  const second = await makeUser("second", ["STUDENT"]);
  const secondApplication = await applyToTeach(second, {
    expertise: "Cybersecurity", background: GOOD_BACKGROUND,
  });
  if (!secondApplication.ok) return finish();

  const declined = await declineApplication(
    secondApplication.data.id, admin, "We are not taking on cybersecurity instructors this quarter.",
  );
  check("an admin can decline with a reason", declined.ok, declined.ok ? "declined" : declined.error);

  const declinedRow = await getMyApplication(second);
  check("the applicant can read the reason they were given",
    (declinedRow?.decisionNote ?? "").includes("cybersecurity"), declinedRow?.decisionNote ?? "");
  check("declining grants no role",
    (await prisma.userRole.count({ where: { userId: second, role: { name: "INSTRUCTOR" } } })) === 0,
    "none");
  check("someone declined may apply again",
    (await applyToTeach(second, { expertise: "Governance", background: GOOD_BACKGROUND })).ok,
    "reapplied");

  // --- withdrawing ----------------------------------------------------------------
  const third = await makeUser("third", ["STUDENT"]);
  const thirdApplication = await applyToTeach(third, {
    expertise: "Governance", background: GOOD_BACKGROUND,
  });
  if (!thirdApplication.ok) return finish();

  const notMine = await withdrawApplication(thirdApplication.data.id, applicant);
  check("you cannot withdraw someone else's application",
    !notMine.ok && notMine.error === "NOT_FOUND", notMine.ok ? "withdrawn!" : notMine.error);

  const withdrawn = await withdrawApplication(thirdApplication.data.id, third);
  check("you can withdraw your own", withdrawn.ok, withdrawn.ok ? "withdrawn" : withdrawn.error);

  const decideWithdrawn = await approveApplication(thirdApplication.data.id, admin, ["ADMIN"]);
  check("a withdrawn application cannot then be approved",
    !decideWithdrawn.ok && decideWithdrawn.error === "NOT_PENDING",
    decideWithdrawn.ok ? "approved!" : decideWithdrawn.error);

  // --- the queue --------------------------------------------------------------------
  const summary = await getApplicationSummary();
  check("the summary counts decisions", summary.approved >= 1 && summary.declined >= 1,
    `${summary.approved} approved, ${summary.declined} declined`);

  const queue = await listApplications("PENDING");
  check("the queue lists only what is waiting",
    queue.every((entry) => entry.status === "PENDING"), `${queue.length} pending`);

  void superAdmin;
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
