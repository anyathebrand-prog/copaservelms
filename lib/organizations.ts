import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";

/**
 * Corporate accounts and bulk enrolment (PRD §13.2, §13.3).
 *
 * The buyer here is an HR or compliance lead enrolling staff who may never have
 * used the platform. So members are provisioned from an email list: a User row
 * is created with no auth link, and the auth trigger claims it when that person
 * eventually signs up — keeping the enrolments already attached to them.
 *
 * Members are notified when they are enrolled, so an imported person learns
 * they have been given a course rather than waiting to be told out of band.
 */

export type BulkResult = {
  created: string[];
  linked: string[];
  enrolled: string[];
  alreadyEnrolled: string[];
  invalid: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, slug: true, contactEmail: true, createdAt: true,
      _count: { select: { members: true } },
    },
  });
}

export async function createOrganization(
  input: { name: string; contactEmail?: string | null },
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: "INVALID" | "DUPLICATE" }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "INVALID" };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!slug) return { ok: false, error: "INVALID" };

  const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return { ok: false, error: "DUPLICATE" };

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: { name, slug, contactEmail: input.contactEmail?.trim() || null },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "organization.create",
        entityType: "Organization",
        entityId: created.id,
        after: { name, slug },
      },
    });

    return created;
  });

  return { ok: true, id: org.id };
}

export async function getOrganization(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true, name: true, slug: true, contactEmail: true,
      members: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, status: true, supabaseUserId: true,
          profile: { select: { firstName: true, lastName: true } },
          enrollments: {
            select: {
              status: true, progressPercent: true, completedAt: true,
              course: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  if (!organization) return null;

  const memberships = organization.members.map((member) => {
    const total = member.enrollments.length;
    const completed = member.enrollments.filter((e) => e.status === "COMPLETED").length;

    return {
      id: member.id,
      email: member.email,
      name: `${member.profile?.firstName ?? ""} ${member.profile?.lastName ?? ""}`.trim() || member.email,
      status: member.status,
      // A member who has never signed in still holds enrolments; showing this
      // is the difference between "not started" and "never onboarded".
      hasSignedIn: member.supabaseUserId !== null,
      courses: total,
      completed,
      averageProgress:
        total === 0
          ? 0
          : Math.round(member.enrollments.reduce((sum, e) => sum + e.progressPercent, 0) / total),
      enrollments: member.enrollments,
    };
  });

  return {
    ...organization,
    memberships,
    summary: {
      members: memberships.length,
      onboarded: memberships.filter((m) => m.hasSignedIn).length,
      enrolments: memberships.reduce((sum, m) => sum + m.courses, 0),
      completions: memberships.reduce((sum, m) => sum + m.completed, 0),
    },
  };
}

/**
 * Add people to an organisation by email, creating accounts where needed.
 *
 * Pre-created users have no auth link and status PENDING. They become live when
 * the person signs up with the same address, at which point the auth trigger
 * claims the row rather than colliding with it.
 */
export async function addMembers(
  organizationId: string,
  rawEmails: string,
  actorId: string,
): Promise<{ ok: true; result: BulkResult } | { ok: false; error: "NOT_FOUND" }> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) return { ok: false, error: "NOT_FOUND" };

  const emails = parseEmails(rawEmails);
  const result: BulkResult = { created: [], linked: [], enrolled: [], alreadyEnrolled: [], invalid: [] };

  for (const email of emails.valid) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, organizationId: true },
    });

    if (existing) {
      if (existing.organizationId !== organizationId) {
        await prisma.user.update({ where: { id: existing.id }, data: { organizationId } });
      }
      result.linked.push(email);
      continue;
    }

    await prisma.user.create({
      data: {
        email,
        status: "PENDING",
        organizationId,
        // Placeholder names; the trigger fills them in from real signup data.
        profile: { create: { firstName: "", lastName: "" } },
        roles: { create: { role: { connect: { name: "STUDENT" } } } },
      },
    });
    result.created.push(email);
  }

  result.invalid = emails.invalid;

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "organization.members.add",
      entityType: "Organization",
      entityId: organizationId,
      after: {
        organization: organization.name,
        created: result.created.length,
        linked: result.linked.length,
        invalid: result.invalid.length,
      },
    },
  });

  return { ok: true, result };
}

/**
 * Enrol an organisation's members into a course.
 *
 * This is the corporate purchase path: the seats are bought out of band, so no
 * payment is taken here. Every enrolment is audited with who granted it.
 */
export async function bulkEnrol(
  organizationId: string,
  courseId: string,
  actorId: string,
): Promise<{ ok: true; result: BulkResult } | { ok: false; error: "NOT_FOUND" | "NOT_PUBLISHED" }> {
  const [organization, course] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, members: { select: { id: true, email: true } } },
    }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, status: true } }),
  ]);

  if (!organization || !course) return { ok: false, error: "NOT_FOUND" };
  if (course.status !== "PUBLISHED") return { ok: false, error: "NOT_PUBLISHED" };

  const result: BulkResult = { created: [], linked: [], enrolled: [], alreadyEnrolled: [], invalid: [] };

  for (const member of organization.members) {
    const existing = await prisma.enrollment.findFirst({
      where: { userId: member.id, courseId },
      select: { id: true },
    });

    if (existing) {
      result.alreadyEnrolled.push(member.email);
      continue;
    }

    await prisma.enrollment.create({
      data: {
        userId: member.id,
        courseId,
        status: "ACTIVE",
        // Records that this was granted rather than self-selected (§15).
        enrolledBy: actorId,
      },
    });

    // Transactional: being given a course is part of the service, not
    // promotion, so it reaches people who declined marketing.
    await sendNotification({
      userId: member.id,
      kind: "enrolment.granted",
      title: `You have been enrolled in ${course.title}`,
      body: `${organization.name} has enrolled you in ${course.title}. Sign in to begin.`,
      actionUrl: "/student/courses",
      channels: ["EMAIL"],
    }).catch(() => {});

    result.enrolled.push(member.email);
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: "organization.bulk_enrol",
      entityType: "Organization",
      entityId: organizationId,
      after: {
        organization: organization.name,
        course: course.title,
        enrolled: result.enrolled.length,
        alreadyEnrolled: result.alreadyEnrolled.length,
      },
    },
  });

  return { ok: true, result };
}

export async function removeMember(
  organizationId: string,
  userId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" }> {
  const member = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, email: true },
  });
  if (!member) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    // Detach from the organisation; the account and its learning history stay.
    // Deleting the user would destroy certificates they legitimately earned.
    prisma.user.update({ where: { id: userId }, data: { organizationId: null } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "organization.members.remove",
        entityType: "Organization",
        entityId: organizationId,
        after: { email: member.email },
      },
    }),
  ]);

  return { ok: true };
}

/** Split a pasted list on commas, semicolons, or newlines, and validate. */
function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const valid = new Set<string>();
  const invalid: string[] = [];

  for (const part of parts) {
    if (EMAIL.test(part)) valid.add(part);
    else invalid.push(part);
  }

  return { valid: [...valid], invalid };
}
