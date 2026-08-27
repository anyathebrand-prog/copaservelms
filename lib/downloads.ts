import { prisma } from "@/lib/prisma";
import { getStorage, CERTIFICATE_BUCKET } from "@/lib/storage";
import { SUBMISSION_BUCKET } from "@/lib/assignments";

/**
 * Download centre (PRD §14).
 *
 * Everything a learner is entitled to a copy of, in one place: certificates,
 * their own submitted work, and course resources.
 *
 * Links are signed at request time and expire. Nothing durable is stored, and
 * nothing is listed that the person is not already entitled to — the queries
 * are scoped by ownership and enrolment rather than filtered after the fact.
 */

export type DownloadItem = {
  id: string;
  kind: "certificate" | "submission" | "resource";
  title: string;
  subtitle: string | null;
  /** Null when the file is missing or could not be signed. */
  url: string | null;
  sizeBytes: number | null;
  createdAt: Date;
};

export async function getDownloads(userId: string): Promise<DownloadItem[]> {
  const [certificates, submissions, resources] = await Promise.all([
    prisma.certificate.findMany({
      // A revoked certificate is deliberately absent: §11.4 withdraws the
      // document, and offering it here would undo that.
      where: { userId, status: "ISSUED" },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true, certificateNumber: true, issuedAt: true, userId: true,
        enrollment: { select: { course: { select: { title: true } } } },
      },
    }),

    prisma.submission.findMany({
      where: { userId, files: { not: [] } },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true, files: true, submittedAt: true, createdAt: true, grade: true,
        assignment: { select: { title: true, course: { select: { title: true } } } },
      },
    }),

    prisma.resource.findMany({
      where: {
        course: { enrollments: { some: { userId, status: { in: ["ACTIVE", "COMPLETED"] } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, title: true, fileUrl: true, sizeBytes: true, createdAt: true,
        course: { select: { title: true } },
      },
    }),
  ]);

  const certificateStorage = getStorage(CERTIFICATE_BUCKET);
  const submissionStorage = getStorage(SUBMISSION_BUCKET);

  const items: DownloadItem[] = [];

  for (const certificate of certificates) {
    items.push({
      id: certificate.id,
      kind: "certificate",
      title: certificate.enrollment.course.title,
      subtitle: certificate.certificateNumber,
      url: await certificateStorage
        .signedUrl(`${certificate.userId}/${certificate.certificateNumber}.pdf`, 600)
        .catch(() => null),
      sizeBytes: null,
      createdAt: certificate.issuedAt ?? new Date(),
    });
  }

  for (const submission of submissions) {
    for (const file of (submission.files ?? []) as { key: string; name: string; sizeBytes: number }[]) {
      items.push({
        id: `${submission.id}:${file.key}`,
        kind: "submission",
        title: file.name,
        subtitle: `${submission.assignment.title} · ${submission.assignment.course.title}`,
        url: await submissionStorage.signedUrl(file.key, 600).catch(() => null),
        sizeBytes: file.sizeBytes,
        createdAt: submission.submittedAt ?? submission.createdAt,
      });
    }
  }

  for (const resource of resources) {
    items.push({
      id: resource.id,
      kind: "resource",
      title: resource.title,
      subtitle: resource.course?.title ?? null,
      // Course resources are stored as URLs by the instructor rather than
      // uploaded, so they are used as given.
      url: resource.fileUrl,
      sizeBytes: resource.sizeBytes,
      createdAt: resource.createdAt,
    });
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
