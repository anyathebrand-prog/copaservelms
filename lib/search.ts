import { prisma } from "@/lib/prisma";

/**
 * Global search (PRD §14).
 *
 * Search is one of the easiest ways to leak the existence of things people
 * cannot otherwise see, so every query here is scoped before it runs rather
 * than filtered afterwards:
 *
 * - Courses: only published ones, which are public anyway.
 * - Lessons: only inside courses the person is enrolled in, or teaches. Lesson
 *   titles describe paid content, so an unenrolled search must not surface them.
 * - Discussions: only inside courses they participate in.
 * - Certificates and payments: only their own, ever.
 *
 * An admin sees more because their role already grants it elsewhere; nothing
 * here widens what a role can reach.
 */

export type SearchGroup = "courses" | "lessons" | "discussions" | "certificates";

export type SearchHit = {
  group: SearchGroup;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  badge?: string;
};

export type SearchResults = {
  query: string;
  total: number;
  groups: { group: SearchGroup; label: string; hits: SearchHit[] }[];
};

const GROUP_LABELS: Record<SearchGroup, string> = {
  courses: "Courses",
  lessons: "Lessons",
  discussions: "Discussions",
  certificates: "Certificates",
};

/** Per-group cap, so one noisy group cannot bury the others. */
const PER_GROUP = 8;

export async function search(
  rawQuery: string,
  userId: string,
  roles: string[],
): Promise<SearchResults> {
  const query = rawQuery.trim();

  // Two characters matches almost everything and costs a full scan.
  if (query.length < 2) {
    return { query, total: 0, groups: [] };
  }

  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  const like = { contains: query, mode: "insensitive" as const };

  // The set of courses whose interior this person may search.
  const accessible = await prisma.course.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { instructorId: userId },
            { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } },
          ],
        },
    select: { id: true, slug: true, title: true },
  });

  const accessibleIds = accessible.map((course) => course.id);
  const slugById = new Map(accessible.map((course) => [course.id, course.slug]));

  const [courses, lessons, discussions, certificates] = await Promise.all([
    prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ title: like }, { subtitle: like }, { description: like }],
      },
      orderBy: { isFeatured: "desc" },
      take: PER_GROUP,
      select: { id: true, title: true, subtitle: true, slug: true, priceMinor: true, currency: true },
    }),

    accessibleIds.length === 0
      ? []
      : prisma.lesson.findMany({
          where: {
            module: { courseId: { in: accessibleIds } },
            OR: [{ title: like }, { content: like }],
          },
          take: PER_GROUP,
          select: {
            id: true, title: true,
            module: { select: { courseId: true, course: { select: { title: true } } } },
          },
        }),

    accessibleIds.length === 0
      ? []
      : prisma.discussionPost.findMany({
          where: {
            courseId: { in: accessibleIds },
            deletedAt: null,
            OR: [{ title: like }, { body: like }],
          },
          orderBy: { createdAt: "desc" },
          take: PER_GROUP,
          select: {
            id: true, title: true, body: true,
            course: { select: { title: true } },
          },
        }),

    prisma.certificate.findMany({
      // Never widened by role: a certificate belongs to one person.
      where: {
        userId,
        OR: [
          { certificateNumber: like },
          { credentialId: like },
          { enrollment: { course: { title: like } } },
        ],
      },
      take: PER_GROUP,
      select: {
        id: true, certificateNumber: true, status: true,
        enrollment: { select: { course: { select: { title: true } } } },
      },
    }),
  ]);

  const groups: SearchResults["groups"] = [];

  if (courses.length) {
    groups.push({
      group: "courses",
      label: GROUP_LABELS.courses,
      hits: courses.map((course) => ({
        group: "courses" as const,
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
        // Enrolled learners go to the player; everyone else to the sales page.
        href: slugById.has(course.id) ? `/student/courses/${course.slug}` : `/courses/${course.slug}`,
        badge: slugById.has(course.id) ? "enrolled" : course.priceMinor === 0 ? "free" : undefined,
      })),
    });
  }

  if (lessons.length) {
    groups.push({
      group: "lessons",
      label: GROUP_LABELS.lessons,
      hits: lessons.map((lesson) => ({
        group: "lessons" as const,
        id: lesson.id,
        title: lesson.title,
        subtitle: lesson.module.course.title,
        href: `/student/courses/${slugById.get(lesson.module.courseId) ?? ""}/lessons/${lesson.id}`,
      })),
    });
  }

  if (discussions.length) {
    groups.push({
      group: "discussions",
      label: GROUP_LABELS.discussions,
      hits: discussions.map((post) => ({
        group: "discussions" as const,
        id: post.id,
        title: post.title || post.body.slice(0, 70),
        subtitle: post.course.title,
        href: `/student/discussions/${post.id}`,
      })),
    });
  }

  if (certificates.length) {
    groups.push({
      group: "certificates",
      label: GROUP_LABELS.certificates,
      hits: certificates.map((certificate) => ({
        group: "certificates" as const,
        id: certificate.id,
        title: certificate.enrollment.course.title,
        subtitle: certificate.certificateNumber,
        href: "/student/certificates",
        badge: certificate.status.toLowerCase(),
      })),
    });
  }

  return {
    query,
    total: groups.reduce((sum, group) => sum + group.hits.length, 0),
    groups,
  };
}
