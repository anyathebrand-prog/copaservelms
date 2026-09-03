import { prisma } from "@/lib/prisma";
import { setUserRole } from "@/lib/admin";
import { sendNotification } from "@/lib/notifications";

/**
 * Applying to teach (PRD §13.2 "approve instructors").
 *
 * Signing up never grants INSTRUCTOR, and it should not: a compliance
 * certificate is worth something precisely because not anyone can issue one.
 * But until now there was no way to ask either — a prospective instructor
 * signed up, landed in the student portal, and had no route to say so, while an
 * admin had no list of anyone waiting.
 *
 * There is deliberately no equivalent for ADMIN. Administrators are invited,
 * never self-nominated, and a queue of people requesting admin rights is a
 * queue of people to be socially engineered into approving.
 */

export type ApplicationError =
  | "NOT_FOUND"
  | "INVALID"
  | "ALREADY_INSTRUCTOR"
  | "ALREADY_PENDING"
  | "NOT_PENDING"
  | "FORBIDDEN";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApplicationError; detail?: string };

/** Long enough to say something real, short enough that nobody writes an essay. */
const MIN_BACKGROUND = 40;
const MAX_FIELD = 2000;

export async function applyToTeach(
  userId: string,
  input: { expertise: string; background: string; link?: string | null },
): Promise<Result<{ id: string }>> {
  const expertise = input.expertise.trim();
  const background = input.background.trim();
  const link = input.link?.trim() || null;

  if (!expertise) {
    return { ok: false, error: "INVALID", detail: "Say what you would like to teach." };
  }
  if (background.length < MIN_BACKGROUND) {
    return {
      ok: false,
      error: "INVALID",
      detail: "Tell us a little more about your background — a sentence or two at least.",
    };
  }
  if (link && !/^https?:\/\//i.test(link)) {
    return { ok: false, error: "INVALID", detail: "A link should start with http:// or https://" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { select: { role: { select: { name: true } } } } },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  if (user.roles.some((entry) => entry.role.name === "INSTRUCTOR")) {
    return { ok: false, error: "ALREADY_INSTRUCTOR" };
  }

  // One open application at a time. A second is not more persuasive, and it
  // makes the reviewer's queue a list of duplicates.
  const pending = await prisma.instructorApplication.findFirst({
    where: { userId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) return { ok: false, error: "ALREADY_PENDING" };

  const application = await prisma.instructorApplication.create({
    data: {
      userId,
      expertise: expertise.slice(0, MAX_FIELD),
      background: background.slice(0, MAX_FIELD),
      link,
    },
    select: { id: true },
  });

  return { ok: true, data: application };
}

/**
 * Approve, which grants the role.
 *
 * The grant goes through setUserRole rather than writing UserRole directly, so
 * this path inherits its permission checks and its audit entry. An approval
 * that did not appear in the audit log would be a privilege change with no
 * record of who made it.
 */
export async function approveApplication(
  id: string,
  actorId: string,
  actorRoles: string[],
  note?: string | null,
): Promise<Result<null>> {
  const application = await prisma.instructorApplication.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true, expertise: true },
  });
  if (!application) return { ok: false, error: "NOT_FOUND" };
  if (application.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };

  const granted = await setUserRole(actorId, actorRoles, application.userId, "INSTRUCTOR", true);
  if (!granted.ok) return { ok: false, error: "FORBIDDEN" };

  await prisma.instructorApplication.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedById: actorId,
      reviewedAt: new Date(),
      decisionNote: note?.trim() || null,
    },
  });

  await sendNotification({
    userId: application.userId,
    kind: "instructor.approved",
    title: "You can now teach on CopaServe",
    body: "Your application was approved. The Teaching area is in the switcher at the top of the page.",
    actionUrl: "/instructor",
    channels: ["EMAIL"],
  }).catch(() => {});

  return { ok: true, data: null };
}

/**
 * Decline, with a reason.
 *
 * The reason is required. Someone who put their background in writing and
 * waited is owed more than a status flipping to declined, and a queue where
 * rejections need no justification is a queue that gets cleared carelessly.
 */
export async function declineApplication(
  id: string,
  actorId: string,
  note: string,
): Promise<Result<null>> {
  const reason = note.trim();
  if (!reason) {
    return { ok: false, error: "INVALID", detail: "Give a reason — the applicant will see it." };
  }

  const application = await prisma.instructorApplication.findUnique({
    where: { id },
    select: { status: true, userId: true },
  });
  if (!application) return { ok: false, error: "NOT_FOUND" };
  if (application.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };

  await prisma.$transaction([
    prisma.instructorApplication.update({
      where: { id },
      data: {
        status: "DECLINED",
        reviewedById: actorId,
        reviewedAt: new Date(),
        decisionNote: reason,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "instructor.decline",
        entityType: "InstructorApplication",
        entityId: id,
        after: { reason },
      },
    }),
  ]);

  await sendNotification({
    userId: application.userId,
    kind: "instructor.declined",
    title: "About your application to teach",
    body: reason,
    actionUrl: "/student/teach",
    channels: ["EMAIL"],
  }).catch(() => {});

  return { ok: true, data: null };
}

/** Withdraw your own application, while it is still open. */
export async function withdrawApplication(id: string, userId: string): Promise<Result<null>> {
  const application = await prisma.instructorApplication.findFirst({
    where: { id, userId },
    select: { status: true },
  });
  if (!application) return { ok: false, error: "NOT_FOUND" };
  if (application.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };

  await prisma.instructorApplication.update({
    where: { id },
    data: { status: "WITHDRAWN", reviewedAt: new Date() },
  });

  return { ok: true, data: null };
}

/** The applicant's own view: their most recent application, whatever its state. */
export async function getMyApplication(userId: string) {
  return prisma.instructorApplication.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true, status: true, expertise: true, background: true, link: true,
      submittedAt: true, reviewedAt: true, decisionNote: true,
    },
  });
}

export async function listApplications(status?: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN") {
  return prisma.instructorApplication.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
    take: 200,
    select: {
      id: true, status: true, expertise: true, background: true, link: true,
      submittedAt: true, reviewedAt: true, decisionNote: true,
      user: {
        select: {
          id: true, email: true,
          profile: { select: { firstName: true, lastName: true, profession: true, organizationName: true } },
        },
      },
      reviewedBy: { select: { email: true } },
    },
  });
}

export async function getApplicationSummary() {
  const [pending, approved, declined] = await Promise.all([
    prisma.instructorApplication.count({ where: { status: "PENDING" } }),
    prisma.instructorApplication.count({ where: { status: "APPROVED" } }),
    prisma.instructorApplication.count({ where: { status: "DECLINED" } }),
  ]);

  return { pending, approved, declined };
}
