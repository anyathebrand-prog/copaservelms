import { prisma } from "@/lib/prisma";

/**
 * Learner calendar (PRD §14).
 *
 * Assembles the dates a learner actually has to act on — live classes and
 * assignment deadlines — from courses they are enrolled in. Nothing here
 * invents its own data; it is a view over what already exists.
 */

export type CalendarEvent = {
  id: string;
  kind: "live-class" | "assignment";
  title: string;
  courseTitle: string;
  courseSlug: string;
  startsAt: Date;
  endsAt: Date | null;
  href: string;
  /** Assignment already submitted, or class already attended. */
  done: boolean;
  overdue: boolean;
  /** Evaluated at fetch time: a component should not recompute "now" on render. */
  past: boolean;
};

export async function getCalendar(userId: string): Promise<CalendarEvent[]> {
  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true, courseId: true, course: { select: { title: true, slug: true } } },
  });

  if (enrolments.length === 0) return [];

  const courseIds = enrolments.map((enrolment) => enrolment.courseId);
  const enrolmentIds = enrolments.map((enrolment) => enrolment.id);
  const courseById = new Map(enrolments.map((e) => [e.courseId, e.course]));

  const [liveClasses, assignments, submissions, attendance] = await Promise.all([
    prisma.liveClass.findMany({
      where: { courseId: { in: courseIds }, status: { not: "CANCELLED" } },
      select: { id: true, courseId: true, title: true, startsAt: true, endsAt: true },
    }),
    prisma.assignment.findMany({
      // An assignment with no due date is work, but not a date.
      where: { courseId: { in: courseIds }, dueAt: { not: null } },
      select: { id: true, courseId: true, title: true, dueAt: true },
    }),
    prisma.submission.findMany({
      where: { enrollmentId: { in: enrolmentIds }, submittedAt: { not: null } },
      select: { assignmentId: true },
    }),
    prisma.liveClassAttendance.findMany({
      where: { userId, attended: true },
      select: { liveClassId: true },
    }),
  ]);

  const submitted = new Set(submissions.map((submission) => submission.assignmentId));
  const attended = new Set(attendance.map((record) => record.liveClassId));
  const now = Date.now();

  const events: CalendarEvent[] = [
    ...liveClasses.map((liveClass) => ({
      id: liveClass.id,
      kind: "live-class" as const,
      title: liveClass.title,
      courseTitle: courseById.get(liveClass.courseId)?.title ?? "",
      courseSlug: courseById.get(liveClass.courseId)?.slug ?? "",
      startsAt: liveClass.startsAt,
      endsAt: liveClass.endsAt,
      href: "/student/live-classes",
      done: attended.has(liveClass.id),
      // A class that has finished is past, not overdue — you cannot be late
      // for something that already happened.
      overdue: false,
      past: liveClass.startsAt.getTime() < now,
    })),
    ...assignments.map((assignment) => ({
      id: assignment.id,
      kind: "assignment" as const,
      title: assignment.title,
      courseTitle: courseById.get(assignment.courseId)?.title ?? "",
      courseSlug: courseById.get(assignment.courseId)?.slug ?? "",
      startsAt: assignment.dueAt!,
      endsAt: null,
      href: `/student/assignments/${assignment.id}`,
      done: submitted.has(assignment.id),
      overdue: assignment.dueAt!.getTime() < now && !submitted.has(assignment.id),
      past: assignment.dueAt!.getTime() < now,
    })),
  ];

  return events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * The same events as an iCalendar feed, so they can live in a real calendar.
 *
 * Dates are emitted in UTC with a Z suffix, which every client understands;
 * emitting local times without a VTIMEZONE block is the usual way these files
 * end up an hour out.
 */
export function toIcs(events: CalendarEvent[], calendarName = "CopaServe"): string {
  const stamp = formatIcsDate(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CopaServe//Learning//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];

  for (const event of events) {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.kind}-${event.id}@copaserve`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsDate(event.startsAt)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(
        event.kind === "assignment" ? `Due: ${event.title}` : event.title,
      )}`,
      `DESCRIPTION:${escapeIcs(event.courseTitle)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF line endings; some clients reject LF-only files.
  return lines.join("\r\n");
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape the characters iCalendar treats as structural. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
