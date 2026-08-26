import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import type { LiveClassProvider, LiveClassStatus } from "@/app/generated/prisma/enums";

/**
 * Live classes (PRD §9.7, §10).
 *
 * §6.1 lists Zoom and Google Meet as placeholder integrations, and that is what
 * this is: an instructor schedules a session and pastes the join link their
 * provider gave them. No OAuth, no meeting created via API.
 *
 * That is a deliberate limit rather than an oversight — automatic meeting
 * creation needs per-instructor OAuth grants and app review from both vendors,
 * which is its own project. Everything around the meeting (scheduling,
 * reminders, attendance, replay, and the attendance rate certificates depend
 * on) is real and works today.
 */

export type LiveClassError =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "NOT_ENROLLED"
  | "PAST"
  | "TOO_EARLY";

export type Result<T> = { ok: true; data: T } | { ok: false; error: LiveClassError; detail?: string };

/** How long before the start time the join link opens. */
const JOIN_WINDOW_MINUTES = 15;

function isAdmin(roles: string[]): boolean {
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

async function assertCourseOwner(courseId: string, userId: string, roles: string[]) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, instructorId: true },
  });

  if (!course) return { ok: false as const, error: "NOT_FOUND" as const };
  if (course.instructorId !== userId && !isAdmin(roles)) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  return { ok: true as const, data: course };
}

export async function scheduleLiveClass(
  courseId: string,
  userId: string,
  roles: string[],
  input: {
    title: string;
    description?: string | null;
    provider: LiveClassProvider;
    joinUrl?: string | null;
    startsAt: Date;
    endsAt?: Date | null;
  },
): Promise<Result<{ id: string }>> {
  const guard = await assertCourseOwner(courseId, userId, roles);
  if (!guard.ok) return guard;

  if (!input.title.trim()) return { ok: false, error: "INVALID", detail: "A title is required." };
  if (Number.isNaN(input.startsAt.getTime())) {
    return { ok: false, error: "INVALID", detail: "That start time is not a valid date." };
  }
  if (input.endsAt && input.endsAt <= input.startsAt) {
    return { ok: false, error: "INVALID", detail: "The end time must be after the start." };
  }
  // Scheduling in the past is almost always a typo, and nobody can attend it.
  if (input.startsAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "PAST", detail: "That start time is in the past." };
  }
  if (input.joinUrl && !/^https:\/\//i.test(input.joinUrl.trim())) {
    return { ok: false, error: "INVALID", detail: "A join link must be an https URL." };
  }

  const liveClass = await prisma.liveClass.create({
    data: {
      courseId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      provider: input.provider,
      joinUrl: input.joinUrl?.trim() || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      status: "SCHEDULED",
    },
    select: { id: true },
  });

  // Enrolled learners are told: a session nobody knows about is a session
  // nobody attends. Transactional — it is part of the course they are taking.
  const enrolments = await prisma.enrollment.findMany({
    where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { userId: true },
  });

  for (const enrolment of enrolments) {
    await sendNotification({
      userId: enrolment.userId,
      kind: "enrolment.granted",
      title: `Live class scheduled: ${input.title.trim()}`,
      body:
        `${guard.data.title} — ${input.startsAt.toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" })}.`,
      actionUrl: "/student/live-classes",
      channels: ["EMAIL"],
    }).catch(() => {});
  }

  return { ok: true, data: liveClass };
}

export async function updateLiveClass(
  liveClassId: string,
  userId: string,
  roles: string[],
  input: {
    joinUrl?: string | null;
    recordingUrl?: string | null;
    status?: LiveClassStatus;
  },
): Promise<Result<{ id: string; courseId: string }>> {
  const liveClass = await prisma.liveClass.findUnique({
    where: { id: liveClassId },
    select: { id: true, courseId: true },
  });
  if (!liveClass) return { ok: false, error: "NOT_FOUND" };

  const guard = await assertCourseOwner(liveClass.courseId, userId, roles);
  if (!guard.ok) return guard;

  for (const url of [input.joinUrl, input.recordingUrl]) {
    if (url && !/^https:\/\//i.test(url.trim())) {
      return { ok: false, error: "INVALID", detail: "Links must be https URLs." };
    }
  }

  await prisma.liveClass.update({
    where: { id: liveClassId },
    data: {
      joinUrl: input.joinUrl === undefined ? undefined : input.joinUrl?.trim() || null,
      recordingUrl: input.recordingUrl === undefined ? undefined : input.recordingUrl?.trim() || null,
      status: input.status,
    },
  });

  return { ok: true, data: liveClass };
}

/**
 * Record that someone joined.
 *
 * Called when a learner opens the join link, which is the only signal we have
 * without a provider webhook. It therefore proves intent to attend rather than
 * actual presence — the field is named `attended` but an instructor should
 * treat it as "clicked join", and the minutes figure only becomes real if a
 * provider integration later reports it.
 */
export async function recordAttendance(
  liveClassId: string,
  userId: string,
): Promise<Result<{ joinUrl: string | null }>> {
  const liveClass = await prisma.liveClass.findUnique({
    where: { id: liveClassId },
    select: { id: true, courseId: true, joinUrl: true, startsAt: true, endsAt: true, status: true },
  });
  if (!liveClass) return { ok: false, error: "NOT_FOUND" };

  const enrolment = await prisma.enrollment.findFirst({
    where: { courseId: liveClass.courseId, userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });
  if (!enrolment) return { ok: false, error: "NOT_ENROLLED" };

  if (liveClass.status === "CANCELLED") {
    return { ok: false, error: "INVALID", detail: "That session was cancelled." };
  }

  const opensAt = liveClass.startsAt.getTime() - JOIN_WINDOW_MINUTES * 60_000;
  if (Date.now() < opensAt) {
    return { ok: false, error: "TOO_EARLY", detail: `The link opens ${JOIN_WINDOW_MINUTES} minutes before the start.` };
  }

  await prisma.liveClassAttendance.upsert({
    where: { liveClassId_userId: { liveClassId, userId } },
    // Re-joining after a dropout must not reset the original join time.
    update: { attended: true },
    create: { liveClassId, userId, attended: true, joinedAt: new Date() },
  });

  return { ok: true, data: { joinUrl: liveClass.joinUrl } };
}

/** Upcoming and past sessions for a learner's enrolled courses (§9.7). */
export async function getLearnerSchedule(userId: string) {
  const classes = await prisma.liveClass.findMany({
    where: { course: { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, title: true, description: true, provider: true, status: true,
      startsAt: true, endsAt: true, recordingUrl: true,
      course: { select: { title: true, slug: true } },
      attendances: { where: { userId }, select: { attended: true, joinedAt: true } },
    },
  });

  const now = Date.now();

  return classes.map((liveClass) => ({
    ...liveClass,
    attended: liveClass.attendances[0]?.attended ?? false,
    // The join link is deliberately not included here — it is returned only by
    // recordAttendance, so opening it is always recorded.
    joinable:
      liveClass.status !== "CANCELLED" &&
      now >= liveClass.startsAt.getTime() - JOIN_WINDOW_MINUTES * 60_000 &&
      now <= (liveClass.endsAt?.getTime() ?? liveClass.startsAt.getTime() + 4 * 3600_000),
    upcoming: liveClass.startsAt.getTime() > now,
  }));
}

/** Sessions and attendance for an instructor's course. */
export async function getCourseSchedule(courseId: string, userId: string, roles: string[]) {
  const guard = await assertCourseOwner(courseId, userId, roles);
  if (!guard.ok) return null;

  const [classes, enrolled] = await Promise.all([
    prisma.liveClass.findMany({
      where: { courseId },
      orderBy: { startsAt: "desc" },
      select: {
        id: true, title: true, provider: true, status: true, joinUrl: true,
        startsAt: true, endsAt: true, recordingUrl: true,
        attendances: {
          select: {
            attended: true, joinedAt: true,
            user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    }),
    prisma.enrollment.count({ where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } } }),
  ]);

  return {
    course: guard.data,
    enrolled,
    classes: classes.map((liveClass) => {
      const present = liveClass.attendances.filter((a) => a.attended).length;
      return {
        ...liveClass,
        present,
        attendanceRate: enrolled === 0 ? 0 : Math.round((present / enrolled) * 100),
      };
    }),
  };
}
