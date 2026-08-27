/**
 * Functional checks for search, calendar, and downloads (PRD §14).
 *
 * Search is the part that can leak. Course titles are public, but lesson
 * titles, discussion content, and certificates are not — and a search box is
 * the easiest place to accidentally confirm that something exists inside a
 * course someone has not paid for. Those boundaries are the bulk of what is
 * asserted here.
 *
 *   npx tsx scripts/verify-discovery.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { search } from "../lib/search";
import { getCalendar, toIcs } from "../lib/calendar";
import { getDownloads } from "../lib/downloads";
import { createPost } from "../lib/discussions";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.discussionLike.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.certificate.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

const STUDENT = ["STUDENT"];
const ADMIN = ["ADMIN"];

async function main() {
  const category = await prisma.category.findFirstOrThrow();
  const marker = `Zephyrine${RUN}`; // distinctive, so hits are unambiguous

  const teacher = await prisma.user.create({
    data: { email: `dsc-t-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Search", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const learner = await prisma.user.create({
    data: { email: `dsc-l-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Search", lastName: "Learner" } } },
  });
  createdUsers.push(learner.id);

  const outsider = await prisma.user.create({
    data: { email: `dsc-o-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Out", lastName: "Sider" } } },
  });
  createdUsers.push(outsider.id);

  const admin = await prisma.user.create({
    data: { email: `dsc-a-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Ad", lastName: "Min" } } },
  });
  createdUsers.push(admin.id);

  const course = await prisma.course.create({
    data: {
      title: `${marker} Compliance Course`, slug: `search-course-${RUN}`,
      subtitle: "Public subtitle", status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 500000,
      modules: { create: [{ title: "M1", position: 1, lessons: { create: [
        { title: `${marker} secret lesson title`, type: "TEXT", position: 1, content: "Paid content." },
      ] } }] },
      assignments: { create: [{ title: `${marker} assignment`, maxPoints: 100, dueAt: new Date(Date.now() + 3 * 86_400_000) }] },
    },
    select: { id: true, slug: true, assignments: { select: { id: true } } },
  });
  createdCourses.push(course.id);

  // A draft course must never surface, even to a search that matches it.
  const draft = await prisma.course.create({
    data: {
      title: `${marker} Unpublished Course`, slug: `search-draft-${RUN}`,
      status: "DRAFT", instructorId: teacher.id, categoryId: category.id,
    },
    select: { id: true },
  });
  createdCourses.push(draft.id);

  const enrolment = await prisma.enrollment.create({
    data: { userId: learner.id, courseId: course.id, status: "ACTIVE" },
  });

  await createPost(course.id, learner.id, STUDENT, {
    title: `${marker} thread`, body: "A question only participants should find.",
  });

  await prisma.liveClass.create({
    data: {
      courseId: course.id, title: `${marker} live session`, provider: "ZOOM",
      startsAt: new Date(Date.now() + 2 * 86_400_000), endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000),
      status: "SCHEDULED",
    },
  });

  await prisma.certificate.create({
    data: {
      certificateNumber: `CERT-TEST-${RUN}`, credentialId: `cred${RUN}`,
      userId: learner.id, enrollmentId: enrolment.id, status: "ISSUED", issuedAt: new Date(),
      verificationUrl: `https://example.test/${RUN}`,
    },
  });

  // --- search: short queries ----------------------------------------------
  const tooShort = await search("a", learner.id, STUDENT);
  check("a one-character query is refused", tooShort.total === 0 && tooShort.groups.length === 0,
    `${tooShort.total} hits`);

  // --- search: public course titles ---------------------------------------
  const outsiderSearch = await search(marker, outsider.id, STUDENT);
  const outsiderGroups = outsiderSearch.groups.map((g) => g.group);
  check("an outsider finds the published course", outsiderGroups.includes("courses"),
    outsiderGroups.join(",") || "nothing");

  // --- search: the leaks that matter --------------------------------------
  check("an outsider does not find lesson titles inside a course they have not bought",
    !outsiderGroups.includes("lessons"), outsiderGroups.join(",") || "none");
  check("an outsider does not find discussions in a course they are not in",
    !outsiderGroups.includes("discussions"), outsiderGroups.join(",") || "none");

  const outsiderCourseHits = outsiderSearch.groups.find((g) => g.group === "courses")?.hits ?? [];
  check("an unpublished course never appears in search",
    outsiderCourseHits.every((hit) => !hit.title.includes("Unpublished")),
    outsiderCourseHits.map((h) => h.title).join(" | ") || "none");

  // --- search: what a participant should see ------------------------------
  const learnerSearch = await search(marker, learner.id, STUDENT);
  const learnerGroups = learnerSearch.groups.map((g) => g.group);
  check("an enrolled learner finds lessons", learnerGroups.includes("lessons"), learnerGroups.join(","));
  check("an enrolled learner finds discussions", learnerGroups.includes("discussions"), learnerGroups.join(","));

  const learnerCourseHit = learnerSearch.groups.find((g) => g.group === "courses")?.hits[0];
  check("an enrolled learner is linked to the player, not the sales page",
    learnerCourseHit?.href.startsWith("/student/courses/") === true, `${learnerCourseHit?.href}`);
  check("an outsider is linked to the public course page",
    outsiderCourseHits[0]?.href.startsWith("/courses/") === true, `${outsiderCourseHits[0]?.href}`);

  // --- search: certificates are never shared ------------------------------
  const ownCert = await search(`CERT-TEST-${RUN}`, learner.id, STUDENT);
  check("a learner finds their own certificate",
    ownCert.groups.some((g) => g.group === "certificates"), `${ownCert.total} hits`);

  const otherCert = await search(`CERT-TEST-${RUN}`, outsider.id, STUDENT);
  check("nobody else finds it, not even by exact number",
    !otherCert.groups.some((g) => g.group === "certificates"), `${otherCert.total} hits`);

  const adminCert = await search(`CERT-TEST-${RUN}`, admin.id, ADMIN);
  check("an admin does not find someone else's certificate through search either",
    !adminCert.groups.some((g) => g.group === "certificates"), `${adminCert.total} hits`);

  // An admin can search inside courses, since that access exists elsewhere.
  const adminSearch = await search(marker, admin.id, ADMIN);
  check("an admin can search lesson content",
    adminSearch.groups.some((g) => g.group === "lessons"),
    adminSearch.groups.map((g) => g.group).join(","));

  // --- calendar -----------------------------------------------------------
  const calendar = await getCalendar(learner.id);
  check("calendar includes the live class and the assignment deadline",
    calendar.some((e) => e.kind === "live-class") && calendar.some((e) => e.kind === "assignment"),
    `${calendar.length} events`);
  check("calendar is ordered by date",
    calendar.every((e, i) => i === 0 || calendar[i - 1].startsAt <= e.startsAt), "ascending");

  const outsiderCalendar = await getCalendar(outsider.id);
  check("a non-enrolled user has an empty calendar", outsiderCalendar.length === 0,
    `${outsiderCalendar.length} events`);

  // An overdue assignment: past due and not submitted.
  await prisma.assignment.update({
    where: { id: course.assignments[0].id },
    data: { dueAt: new Date(Date.now() - 86_400_000) },
  });
  const overdue = await getCalendar(learner.id);
  const overdueEvent = overdue.find((e) => e.kind === "assignment");
  check("an unsubmitted past deadline is overdue", overdueEvent?.overdue === true, `${overdueEvent?.overdue}`);

  await prisma.submission.create({
    data: {
      assignmentId: course.assignments[0].id, userId: learner.id, enrollmentId: enrolment.id,
      status: "SUBMITTED", submittedAt: new Date(),
    },
  });
  const afterSubmit = await getCalendar(learner.id);
  const submittedEvent = afterSubmit.find((e) => e.kind === "assignment");
  check("submitting clears the overdue flag",
    submittedEvent?.overdue === false && submittedEvent.done === true,
    `overdue=${submittedEvent?.overdue} done=${submittedEvent?.done}`);

  // --- ics ----------------------------------------------------------------
  const ics = toIcs(afterSubmit);
  check("ics has the required envelope",
    ics.startsWith("BEGIN:VCALENDAR") && ics.trimEnd().endsWith("END:VCALENDAR"), "well formed");
  check("ics uses CRLF line endings as RFC 5545 requires", ics.includes("\r\n"), "CRLF");
  check("ics emits UTC timestamps",
    /DTSTART:\d{8}T\d{6}Z/.test(ics), (ics.match(/DTSTART:[^\r\n]+/) ?? [""])[0]);
  check("ics contains one event per calendar entry",
    (ics.match(/BEGIN:VEVENT/g) ?? []).length === afterSubmit.length,
    `${(ics.match(/BEGIN:VEVENT/g) ?? []).length} of ${afterSubmit.length}`);

  // Commas and semicolons are structural in iCalendar and must be escaped.
  const escaped = toIcs([{ ...afterSubmit[0], title: "Comma, and; semicolon", courseTitle: "A, B" }]);
  check("ics escapes structural characters",
    escaped.includes("Comma\\, and\\; semicolon"),
    (escaped.match(/SUMMARY:[^\r\n]+/) ?? [""])[0]);

  // --- downloads ----------------------------------------------------------
  const downloads = await getDownloads(learner.id);
  check("downloads include the learner's certificate",
    downloads.some((d) => d.kind === "certificate"), `${downloads.length} items`);

  const outsiderDownloads = await getDownloads(outsider.id);
  check("downloads are empty for someone with nothing", outsiderDownloads.length === 0,
    `${outsiderDownloads.length} items`);

  // A revoked certificate must stop being downloadable (§11.4).
  await prisma.certificate.updateMany({
    where: { userId: learner.id },
    data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "test" },
  });
  const afterRevoke = await getDownloads(learner.id);
  check("a revoked certificate is no longer offered",
    !afterRevoke.some((d) => d.kind === "certificate"), `${afterRevoke.length} items`);

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
