import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import type { CourseStatus, RoleName, UserStatus } from "@/app/generated/prisma/enums";

/**
 * Admin & Super Admin operations (PRD §13).
 *
 * Two rules run through everything here:
 *
 * 1. Every state-changing action writes an AuditLog row (§6.2, "audit
 *    everything"). The write is part of the same transaction as the change, so
 *    an action cannot succeed without its audit record.
 * 2. An admin cannot use these tools on themselves in ways that would remove
 *    their own access, or that would leave the platform with no Super Admin.
 */

export type AdminError =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "SELF_TARGET"
  | "LAST_SUPER_ADMIN";

export type Result<T> = { ok: true; data: T } | { ok: false; error: AdminError };

export function isAdmin(roles: string[]): boolean {
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes("SUPER_ADMIN");
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Build an AuditLog create payload.
 *
 * Returned rather than executed so callers can include it in the same
 * transaction as the change it records — an audit trail written separately can
 * drift from what actually happened.
 */
export function auditEntry(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function getAuditLog(limit = 100, cursor?: string) {
  return prisma.auditLog.findMany({
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      before: true,
      after: true,
      actor: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard (§13.1)
// ---------------------------------------------------------------------------

export async function getAdminOverview() {
  const [
    students,
    instructors,
    activeCourses,
    pendingCourses,
    pendingUsers,
    certificatesIssued,
    walletsConnected,
    revenueMinor,
  ] = await Promise.all([
    prisma.user.count({ where: { roles: { some: { role: { name: "STUDENT" } } }, deletedAt: null } }),
    prisma.user.count({ where: { roles: { some: { role: { name: "INSTRUCTOR" } } }, deletedAt: null } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.course.count({ where: { status: "SUBMITTED" } }),
    prisma.user.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.certificate.count({ where: { status: "ISSUED" } }),
    prisma.wallet.count({ where: { disconnectedAt: null } }),
    prisma.payment.aggregate({ where: { status: "SUCCESSFUL" }, _sum: { amountMinor: true } }),
  ]);

  return {
    students,
    instructors,
    activeCourses,
    pendingCourses,
    pendingUsers,
    certificatesIssued,
    walletsConnected,
    revenueMinor: revenueMinor._sum.amountMinor ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Course approval (§13.2)
// ---------------------------------------------------------------------------

export async function getCourseQueue(status: CourseStatus | "ALL" = "SUBMITTED") {
  return prisma.course.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: [{ submittedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      submittedAt: true,
      publishedAt: true,
      priceMinor: true,
      currency: true,
      category: { select: { name: true } },
      instructor: {
        select: { email: true, profile: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { modules: true, enrollments: true } },
    },
  });
}

/**
 * Approve, publish, or reject a submitted course.
 *
 * Rejection returns the course to DRAFT with the reason recorded in the audit
 * log — the instructor gets their work back to edit rather than losing it.
 */
export async function reviewCourse(
  actorId: string,
  actorRoles: string[],
  courseId: string,
  decision: "APPROVE" | "PUBLISH" | "REJECT" | "ARCHIVE",
  reason?: string,
): Promise<Result<{ status: CourseStatus }>> {
  if (!isAdmin(actorRoles)) return { ok: false, error: "FORBIDDEN" };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, status: true, title: true, instructorId: true },
  });
  if (!course) return { ok: false, error: "NOT_FOUND" };

  const nextStatus: CourseStatus =
    decision === "APPROVE"
      ? "APPROVED"
      : decision === "PUBLISH"
        ? "PUBLISHED"
        : decision === "ARCHIVE"
          ? "ARCHIVED"
          : "DRAFT";

  if (decision === "REJECT" && !reason?.trim()) {
    // A rejection with no reason gives the instructor nothing to act on.
    return { ok: false, error: "INVALID" };
  }

  const [updated] = await prisma.$transaction([
    prisma.course.update({
      where: { id: courseId },
      data: {
        status: nextStatus,
        approvedAt: nextStatus === "APPROVED" ? new Date() : undefined,
        publishedAt: nextStatus === "PUBLISHED" ? new Date() : undefined,
      },
      select: { status: true },
    }),
    auditEntry({
      actorId,
      action: `course.${decision.toLowerCase()}`,
      entityType: "Course",
      entityId: courseId,
      before: { status: course.status },
      after: { status: nextStatus, title: course.title, reason: reason?.trim() ?? null },
    }),
  ]);

  // A rejection is useless to an instructor who never hears about it.
  if (decision === "REJECT" || decision === "PUBLISH") {
    await sendNotification({
      userId: course.instructorId,
      kind: decision === "REJECT" ? "course.rejected" : "course.approved",
      title:
        decision === "REJECT"
          ? `${course.title} needs changes`
          : `${course.title} is now live`,
      body:
        decision === "REJECT"
          ? `Your course was returned to draft. ${reason?.trim() ?? ""}`.trim()
          : "Your course has been published and is now visible in the catalogue.",
      actionUrl: `/instructor/courses/${courseId}`,
      channels: ["EMAIL"],
    }).catch(() => {});
  }

  return { ok: true, data: updated };
}

// ---------------------------------------------------------------------------
// User management (§13.2)
// ---------------------------------------------------------------------------

export async function getUsers(filter?: { status?: UserStatus; role?: RoleName; query?: string }) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      status: filter?.status,
      roles: filter?.role ? { some: { role: { name: filter.role } } } : undefined,
      email: filter?.query ? { contains: filter.query, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      profile: { select: { firstName: true, lastName: true, organizationName: true } },
      roles: { select: { role: { select: { name: true } } } },
      _count: { select: { enrollments: true, coursesTaught: true } },
    },
  });
}

export async function setUserStatus(
  actorId: string,
  actorRoles: string[],
  userId: string,
  status: UserStatus,
): Promise<Result<{ status: UserStatus }>> {
  if (!isAdmin(actorRoles)) return { ok: false, error: "FORBIDDEN" };

  // Suspending yourself locks you out of the tool you would need to undo it.
  if (userId === actorId) return { ok: false, error: "SELF_TARGET" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, email: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!target || !target) return { ok: false, error: "NOT_FOUND" };

  const targetIsSuper = target.roles.some((r) => r.role.name === "SUPER_ADMIN");

  // Only a Super Admin may act on another Super Admin.
  if (targetIsSuper && !isSuperAdmin(actorRoles)) return { ok: false, error: "FORBIDDEN" };

  if (targetIsSuper && status !== "ACTIVE") {
    const remaining = await countActiveSuperAdmins(userId);
    if (remaining === 0) return { ok: false, error: "LAST_SUPER_ADMIN" };
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status }, select: { status: true } }),
    auditEntry({
      actorId,
      action: `user.status.${status.toLowerCase()}`,
      entityType: "User",
      entityId: userId,
      before: { status: target.status },
      after: { status, email: target.email },
    }),
  ]);

  return { ok: true, data: updated };
}

/**
 * Grant or revoke a role.
 *
 * Granting INSTRUCTOR is the "approve instructor" path in §13.2. ADMIN and
 * SUPER_ADMIN may only be granted by a Super Admin — an admin who could mint
 * admins is effectively a super admin.
 */
export async function setUserRole(
  actorId: string,
  actorRoles: string[],
  userId: string,
  role: RoleName,
  grant: boolean,
): Promise<Result<{ roles: string[] }>> {
  if (!isAdmin(actorRoles)) return { ok: false, error: "FORBIDDEN" };

  const privileged = role === "ADMIN" || role === "SUPER_ADMIN";
  if (privileged && !isSuperAdmin(actorRoles)) return { ok: false, error: "FORBIDDEN" };

  // Removing your own privilege is how people lock themselves out.
  if (userId === actorId && !grant && privileged) return { ok: false, error: "SELF_TARGET" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, roles: { select: { role: { select: { id: true, name: true } } } } },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };

  const roleRow = await prisma.role.findUnique({ where: { name: role }, select: { id: true } });
  if (!roleRow) return { ok: false, error: "NOT_FOUND" };

  const before = target.roles.map((r) => r.role.name);

  if (role === "SUPER_ADMIN" && !grant) {
    const remaining = await countActiveSuperAdmins(userId);
    if (remaining === 0) return { ok: false, error: "LAST_SUPER_ADMIN" };
  }

  if (grant) {
    await prisma.$transaction([
      prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: roleRow.id } },
        update: { assignedBy: actorId },
        create: { userId, roleId: roleRow.id, assignedBy: actorId },
      }),
      auditEntry({
        actorId,
        action: "user.role.grant",
        entityType: "User",
        entityId: userId,
        before: { roles: before },
        after: { role, email: target.email },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId, roleId: roleRow.id } }),
      auditEntry({
        actorId,
        action: "user.role.revoke",
        entityType: "User",
        entityId: userId,
        before: { roles: before },
        after: { role, email: target.email },
      }),
    ]);
  }

  const after = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });

  return { ok: true, data: { roles: after.map((r) => r.role.name) } };
}

/**
 * Active Super Admins other than `excludingUserId`.
 *
 * Note on the LAST_SUPER_ADMIN guard this feeds: under the current rules it is
 * unreachable, and that is verified rather than assumed. Only a Super Admin may
 * demote or suspend another, and the acting Super Admin is themselves active
 * and excluded from the target — so the count is always at least one. An ADMIN
 * cannot act on a Super Admin at all. The real protection against locking the
 * platform out is the self-target guard.
 *
 * It is kept as a backstop because it becomes reachable the moment the
 * self-target rule is relaxed (for example, to let one Super Admin step down
 * via a delegated action). Do not mistake it for tested behaviour.
 */
async function countActiveSuperAdmins(excludingUserId: string): Promise<number> {
  return prisma.user.count({
    where: {
      id: { not: excludingUserId },
      status: "ACTIVE",
      deletedAt: null,
      roles: { some: { role: { name: "SUPER_ADMIN" } } },
    },
  });
}
