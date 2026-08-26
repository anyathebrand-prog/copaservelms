/**
 * Functional checks for live classes (PRD §9.7).
 *
 * The integration itself is a placeholder by design — an instructor pastes a
 * join link rather than CopaServe creating the meeting. What is real, and what
 * is tested here, is everything around it: scheduling rules, the join window,
 * who may attend, and the attendance record that §11.1 lets a course require
 * for a certificate.
 *
 *   npx tsx scripts/verify-live-classes.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  getCourseSchedule,
  getLearnerSchedule,
  recordAttendance,
  scheduleLiveClass,
  updateLiveClass,
} from "../lib/live-classes";

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
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

const INSTRUCTOR = ["INSTRUCTOR"];
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `lc-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Live", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const rival = await prisma.user.create({
    data: { email: `lc-rival-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Rival", lastName: "Teacher" } } },
  });
  createdUsers.push(rival.id);

  const learner = await prisma.user.create({
    data: { email: `lc-learner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Live", lastName: "Learner" } } },
  });
  createdUsers.push(learner.id);

  const outsider = await prisma.user.create({
    data: { email: `lc-outsider-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Not", lastName: "Enrolled" } } },
  });
  createdUsers.push(outsider.id);

  const course = await prisma.course.create({
    data: { title: `Live Course ${RUN}`, slug: `live-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id },
    select: { id: true },
  });
  createdCourses.push(course.id);

  await prisma.enrollment.create({
    data: { userId: learner.id, courseId: course.id, status: "ACTIVE" },
  });

  // --- scheduling rules ---------------------------------------------------
  const inPast = await scheduleLiveClass(course.id, teacher.id, INSTRUCTOR, {
    title: "Yesterday", provider: "ZOOM", startsAt: minutes(-120),
  });
  check("cannot schedule a session in the past", !inPast.ok && inPast.error === "PAST",
    inPast.ok ? "scheduled!" : inPast.error);

  const backwards = await scheduleLiveClass(course.id, teacher.id, INSTRUCTOR, {
    title: "Backwards", provider: "ZOOM", startsAt: minutes(60), endsAt: minutes(30),
  });
  check("cannot end a session before it starts", !backwards.ok && backwards.error === "INVALID",
    backwards.ok ? "scheduled!" : `${backwards.error}`);

  const httpLink = await scheduleLiveClass(course.id, teacher.id, INSTRUCTOR, {
    title: "Insecure", provider: "ZOOM", startsAt: minutes(60), joinUrl: "http://zoom.us/j/1",
  });
  check("refuses a non-https join link", !httpLink.ok && httpLink.error === "INVALID",
    httpLink.ok ? "accepted!" : `${httpLink.error}`);

  const notMine = await scheduleLiveClass(course.id, rival.id, INSTRUCTOR, {
    title: "Hijack", provider: "ZOOM", startsAt: minutes(60),
  });
  check("another instructor cannot schedule on this course",
    !notMine.ok && notMine.error === "NOT_FOUND", notMine.ok ? "scheduled!" : notMine.error);

  // --- a real session -----------------------------------------------------
  const soon = await scheduleLiveClass(course.id, teacher.id, INSTRUCTOR, {
    title: `Workshop ${RUN}`, description: "Breach response.", provider: "ZOOM",
    startsAt: minutes(5), endsAt: minutes(65), joinUrl: "https://zoom.us/j/123456",
  });
  check("schedules a valid session", soon.ok, soon.ok ? soon.data.id : `${soon.error}`);
  if (!soon.ok) return finish();

  const later = await scheduleLiveClass(course.id, teacher.id, INSTRUCTOR, {
    title: `Future ${RUN}`, provider: "GOOGLE_MEET", startsAt: minutes(120),
    joinUrl: "https://meet.google.com/abc-defg-hij",
  });
  check("schedules a second session", later.ok, later.ok ? "scheduled" : `${later.error}`);

  // Learners are told, because a session nobody knows about is unattended.
  const notified = await prisma.notification.count({
    where: { userId: learner.id, title: { contains: `Workshop ${RUN}` } },
  });
  check("enrolled learners are notified", notified === 1, `${notified} notification(s)`);

  const outsiderNotified = await prisma.notification.count({
    where: { userId: outsider.id, title: { contains: `Workshop ${RUN}` } },
  });
  check("non-enrolled users are not notified", outsiderNotified === 0, `${outsiderNotified}`);

  // --- the join window ----------------------------------------------------
  const tooEarly = await recordAttendance(later.ok ? later.data.id : "", learner.id);
  check("joining more than 15 minutes early is refused",
    !tooEarly.ok && tooEarly.error === "TOO_EARLY", tooEarly.ok ? "joined!" : `${tooEarly.error}`);

  const strangerJoin = await recordAttendance(soon.data.id, outsider.id);
  check("a non-enrolled user cannot join",
    !strangerJoin.ok && strangerJoin.error === "NOT_ENROLLED",
    strangerJoin.ok ? "joined!" : `${strangerJoin.error}`);

  const joined = await recordAttendance(soon.data.id, learner.id);
  check("an enrolled learner joins inside the window and gets the link",
    joined.ok && joined.data.joinUrl === "https://zoom.us/j/123456",
    joined.ok ? "link returned" : `${joined.error}`);

  const attendance = await prisma.liveClassAttendance.findFirstOrThrow({
    where: { liveClassId: soon.data.id, userId: learner.id },
  });
  check("attendance is recorded on join", attendance.attended && attendance.joinedAt !== null,
    `attended=${attendance.attended}`);

  const firstJoin = attendance.joinedAt;
  await recordAttendance(soon.data.id, learner.id);
  const rejoined = await prisma.liveClassAttendance.findFirstOrThrow({
    where: { liveClassId: soon.data.id, userId: learner.id },
  });
  check("re-joining does not reset the original join time",
    rejoined.joinedAt?.getTime() === firstJoin?.getTime(), "unchanged");

  const rows = await prisma.liveClassAttendance.count({
    where: { liveClassId: soon.data.id, userId: learner.id },
  });
  check("re-joining does not duplicate the attendance row", rows === 1, `${rows} row(s)`);

  // --- the join link is never rendered ------------------------------------
  const schedule = await getLearnerSchedule(learner.id);
  const serialised = JSON.stringify(schedule);
  check("the learner schedule never carries the join link",
    !serialised.includes("zoom.us/j/123456"),
    serialised.includes("zoom.us/j/123456") ? "LEAKED" : "not present");
  check("the schedule marks which session is joinable",
    schedule.find((s) => s.id === soon.data.id)?.joinable === true &&
      schedule.find((s) => s.id === (later.ok ? later.data.id : ""))?.joinable === false,
    "window respected");

  const outsiderSchedule = await getLearnerSchedule(outsider.id);
  check("a non-enrolled user sees no sessions", outsiderSchedule.length === 0,
    `${outsiderSchedule.length}`);

  // --- cancellation -------------------------------------------------------
  const cancelled = await updateLiveClass(soon.data.id, teacher.id, INSTRUCTOR, { status: "CANCELLED" });
  check("instructor cancels a session", cancelled.ok, cancelled.ok ? "cancelled" : `${cancelled.error}`);

  const joinCancelled = await recordAttendance(soon.data.id, learner.id);
  check("a cancelled session cannot be joined", !joinCancelled.ok,
    joinCancelled.ok ? "joined!" : `${joinCancelled.error}`);

  const rivalUpdate = await updateLiveClass(soon.data.id, rival.id, INSTRUCTOR, {
    recordingUrl: "https://evil.example/replay",
  });
  check("another instructor cannot edit the session",
    !rivalUpdate.ok && rivalUpdate.error === "NOT_FOUND",
    rivalUpdate.ok ? "edited!" : `${rivalUpdate.error}`);

  // --- instructor view ----------------------------------------------------
  const courseView = await getCourseSchedule(course.id, teacher.id, INSTRUCTOR);
  check("instructor sees attendance counts and rate",
    courseView?.classes.find((c) => c.id === soon.data.id)?.present === 1 &&
      courseView.classes.find((c) => c.id === soon.data.id)?.attendanceRate === 100,
    `${courseView?.classes.find((c) => c.id === soon.data.id)?.attendanceRate}%`);

  const rivalView = await getCourseSchedule(course.id, rival.id, INSTRUCTOR);
  check("another instructor cannot view the schedule", rivalView === null,
    rivalView === null ? "null" : "leaked");

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
