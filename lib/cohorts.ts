import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";

/**
 * Departments and cohorts (PRD §13.3).
 *
 * Two different shapes for two different questions. A department answers
 * "who does this person work for", so it is a single value on the person. A
 * cohort answers "who trained together", so it is a membership that
 * accumulates — the January intake and next year's refresher are both true of
 * the same learner.
 *
 * Reporting is the point of both. An HR lead does not want a list of every
 * employee; they want to know which department is behind on its training.
 */

export type CohortError = "NOT_FOUND" | "INVALID" | "DUPLICATE" | "NOT_PUBLISHED";
export type Result<T> = { ok: true; data: T } | { ok: false; error: CohortError; detail?: string };

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function createDepartment(
  organizationId: string,
  input: { name: string; code?: string | null },
  actorId: string,
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "INVALID", detail: "A department needs a name." };

  const existing = await prisma.department.findFirst({
    where: { organizationId, name },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "DUPLICATE", detail: "That department already exists." };

  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: { organizationId, name, code: input.code?.trim() || null },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "department.create",
        entityType: "Department",
        entityId: created.id,
        after: { organizationId, name },
      },
    });

    return created;
  });

  return { ok: true, data: department };
}

/**
 * Move someone into a department, or out of one with a null id.
 *
 * The person must already belong to the organisation: a department is a unit
 * within it, so assigning an outsider would create a member by side effect.
 */
export async function assignDepartment(
  userId: string,
  departmentId: string | null,
  actorId: string,
): Promise<Result<null>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  if (departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { organizationId: true },
    });
    if (!department) return { ok: false, error: "NOT_FOUND" };

    if (department.organizationId !== user.organizationId) {
      return {
        ok: false,
        error: "INVALID",
        detail: "That person is not a member of this organisation.",
      };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { departmentId } });
  void actorId;

  return { ok: true, data: null };
}

export async function deleteDepartment(id: string, actorId: string): Promise<Result<null>> {
  const department = await prisma.department.findUnique({
    where: { id },
    select: { name: true, organizationId: true },
  });
  if (!department) return { ok: false, error: "NOT_FOUND" };

  // Members are detached, not deleted. A department is an organisational
  // convenience; the people in it are not.
  await prisma.$transaction([
    prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } }),
    prisma.department.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "department.delete",
        entityType: "Department",
        entityId: id,
        after: { name: department.name },
      },
    }),
  ]);

  return { ok: true, data: null };
}

/** Completion by department — the question an HR lead actually asks. */
export async function getDepartmentReport(organizationId: string) {
  const departments = await prisma.department.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, code: true,
      members: {
        select: {
          id: true,
          enrollments: { select: { status: true, progressPercent: true } },
        },
      },
    },
  });

  const unassigned = await prisma.user.count({
    where: { organizationId, departmentId: null, deletedAt: null },
  });

  return {
    departments: departments.map((department) => {
      const enrolments = department.members.flatMap((member) => member.enrollments);
      const completed = enrolments.filter((e) => e.status === "COMPLETED").length;

      return {
        id: department.id,
        name: department.name,
        code: department.code,
        members: department.members.length,
        enrolments: enrolments.length,
        completed,
        completionRate: enrolments.length === 0 ? 0 : Math.round((completed / enrolments.length) * 100),
        averageProgress:
          enrolments.length === 0
            ? 0
            : Math.round(enrolments.reduce((sum, e) => sum + e.progressPercent, 0) / enrolments.length),
      };
    }),
    unassigned,
  };
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

export async function createCohort(
  input: {
    name: string;
    organizationId?: string | null;
    courseId?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
  actorId: string,
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "INVALID", detail: "A cohort needs a name." };

  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    return { ok: false, error: "INVALID", detail: "The end date must be after the start." };
  }

  const cohort = await prisma.cohort.create({
    data: {
      name,
      organizationId: input.organizationId || null,
      courseId: input.courseId || null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdById: actorId,
    },
    select: { id: true },
  });

  return { ok: true, data: cohort };
}

/** Add people to a cohort. Already-members are skipped rather than duplicated. */
export async function addCohortMembers(
  cohortId: string,
  userIds: string[],
  actorId: string,
): Promise<Result<{ added: number; skipped: number }>> {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: { id: true, organizationId: true },
  });
  if (!cohort) return { ok: false, error: "NOT_FOUND" };

  // A cohort belonging to an organisation may only contain its people.
  const eligible = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      deletedAt: null,
      ...(cohort.organizationId ? { organizationId: cohort.organizationId } : {}),
    },
    select: { id: true },
  });

  const existing = await prisma.cohortMember.findMany({
    where: { cohortId, userId: { in: eligible.map((u) => u.id) } },
    select: { userId: true },
  });
  const already = new Set(existing.map((member) => member.userId));
  const toAdd = eligible.filter((user) => !already.has(user.id));

  if (toAdd.length > 0) {
    await prisma.cohortMember.createMany({
      data: toAdd.map((user) => ({ cohortId, userId: user.id })),
      skipDuplicates: true,
    });
  }

  void actorId;

  return {
    ok: true,
    data: { added: toAdd.length, skipped: userIds.length - toAdd.length },
  };
}

export async function removeCohortMember(cohortId: string, userId: string): Promise<Result<null>> {
  const membership = await prisma.cohortMember.findFirst({
    where: { cohortId, userId },
    select: { id: true },
  });
  if (!membership) return { ok: false, error: "NOT_FOUND" };

  await prisma.cohortMember.delete({ where: { id: membership.id } });
  return { ok: true, data: null };
}

/**
 * Enrol a whole cohort into a course.
 *
 * The reason cohorts exist: a January intake is enrolled once, not member by
 * member. Anyone already enrolled is left alone rather than re-enrolled, which
 * would reset nothing but would look like it might.
 */
export async function enrolCohort(
  cohortId: string,
  courseId: string,
  actorId: string,
): Promise<Result<{ enrolled: number; alreadyEnrolled: number }>> {
  const [cohort, course] = await Promise.all([
    prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { id: true, name: true, members: { select: { userId: true } } },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    }),
  ]);

  if (!cohort || !course) return { ok: false, error: "NOT_FOUND" };
  if (course.status !== "PUBLISHED") return { ok: false, error: "NOT_PUBLISHED" };

  let enrolled = 0;
  let alreadyEnrolled = 0;

  for (const member of cohort.members) {
    const existing = await prisma.enrollment.findFirst({
      where: { userId: member.userId, courseId },
      select: { id: true },
    });

    if (existing) {
      alreadyEnrolled += 1;
      continue;
    }

    await prisma.enrollment.create({
      data: { userId: member.userId, courseId, status: "ACTIVE", enrolledBy: actorId },
    });
    enrolled += 1;

    await sendNotification({
      userId: member.userId,
      kind: "enrolment.granted",
      title: `You have been enrolled in ${course.title}`,
      body: `As part of ${cohort.name}. Sign in to begin.`,
      actionUrl: "/student/courses",
      channels: ["EMAIL"],
    }).catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "cohort.enrol",
      entityType: "Cohort",
      entityId: cohortId,
      after: { cohort: cohort.name, course: course.title, enrolled, alreadyEnrolled },
    },
  });

  return { ok: true, data: { enrolled, alreadyEnrolled } };
}

export async function listCohorts(organizationId?: string) {
  return prisma.cohort.findMany({
    where: organizationId ? { organizationId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, name: true, startsAt: true, endsAt: true, createdAt: true,
      organization: { select: { name: true } },
      course: { select: { title: true } },
      _count: { select: { members: true } },
    },
  });
}

/** Progress for one cohort, which is how a training manager tracks an intake. */
export async function getCohortReport(cohortId: string) {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: {
      id: true, name: true, startsAt: true, endsAt: true,
      courseId: true,
      organizationId: true,
      course: { select: { title: true } },
      organization: { select: { name: true } },
      members: {
        select: {
          joinedAt: true,
          user: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
              department: { select: { name: true } },
              enrollments: {
                select: {
                  courseId: true, status: true, progressPercent: true, completedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cohort) return null;

  const members = cohort.members.map((member) => {
    // Where the cohort names a course, report on that course rather than
    // averaging across everything the person happens to be studying.
    const relevant = cohort.courseId
      ? member.user.enrollments.filter((e) => e.courseId === cohort.courseId)
      : member.user.enrollments;

    const completed = relevant.filter((e) => e.status === "COMPLETED").length;

    return {
      id: member.user.id,
      name:
        `${member.user.profile?.firstName ?? ""} ${member.user.profile?.lastName ?? ""}`.trim() ||
        member.user.email,
      email: member.user.email,
      department: member.user.department?.name ?? null,
      joinedAt: member.joinedAt,
      enrolled: relevant.length > 0,
      completed,
      progress:
        relevant.length === 0
          ? 0
          : Math.round(relevant.reduce((sum, e) => sum + e.progressPercent, 0) / relevant.length),
    };
  });

  return {
    ...cohort,
    members,
    summary: {
      members: members.length,
      enrolled: members.filter((m) => m.enrolled).length,
      completed: members.filter((m) => m.completed > 0).length,
      averageProgress:
        members.length === 0
          ? 0
          : Math.round(members.reduce((sum, m) => sum + m.progress, 0) / members.length),
    },
  };
}
