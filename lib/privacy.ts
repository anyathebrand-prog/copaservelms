import { prisma } from "@/lib/prisma";
import type { ConsentAction, ConsentType, DataRequestType } from "@/app/generated/prisma/enums";

/**
 * NDPA privacy centre (PRD §12.1, §12.2).
 *
 * Two principles shape this module:
 *
 * - Consent is a log, not a flag. Withdrawing consent appends a WITHDRAWN
 *   entry rather than deleting the GRANTED one, so the history of what a
 *   person agreed to and when survives — which is the thing a regulator asks
 *   for. Current state is derived from the most recent entry per type.
 * - Erasure and correction are requests, not switches. Both are weighed
 *   against retention obligations by a human, so they are recorded for an
 *   admin to action rather than executed on submission.
 */

/** Consent types a user can manage themselves. */
export const MANAGEABLE_CONSENTS: ConsentType[] = [
  "MARKETING_EMAIL",
  "MARKETING_SMS",
  "COOKIES",
];

/** Consents that record acceptance of a policy and cannot simply be toggled off. */
export const POLICY_CONSENTS: ConsentType[] = [
  "PRIVACY_NOTICE",
  "TERMS_OF_SERVICE",
  "DATA_PROCESSING",
];

export type ConsentState = {
  type: ConsentType;
  granted: boolean;
  updatedAt: Date | null;
  policyVersion: string | null;
};

/**
 * Current consent state, derived from the newest entry of each type.
 *
 * Absence of an entry means never granted — the NDPA default is no consent,
 * not implied consent.
 */
export async function getConsentState(userId: string): Promise<ConsentState[]> {
  const logs = await prisma.consentLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { type: true, action: true, createdAt: true, policyVersion: true },
  });

  const newest = new Map<ConsentType, (typeof logs)[number]>();
  for (const log of logs) {
    if (!newest.has(log.type)) newest.set(log.type, log);
  }

  return [...MANAGEABLE_CONSENTS, ...POLICY_CONSENTS].map((type) => {
    const latest = newest.get(type);
    return {
      type,
      granted: latest?.action === "GRANTED" || latest?.action === "UPDATED",
      updatedAt: latest?.createdAt ?? null,
      policyVersion: latest?.policyVersion ?? null,
    };
  });
}

export async function getConsentHistory(userId: string, limit = 100) {
  return prisma.consentLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      action: true,
      policyVersion: true,
      createdAt: true,
      ipAddress: true,
    },
  });
}

export async function recordConsent(input: {
  userId: string;
  type: ConsentType;
  action: ConsentAction;
  policyVersion?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.consentLog.create({
    data: {
      userId: input.userId,
      type: input.type,
      action: input.action,
      policyVersion: input.policyVersion ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
    select: { id: true, type: true, action: true, createdAt: true },
  });
}

/**
 * Everything held about a person, as a portable object (§12.1 portability).
 *
 * Deliberately assembled field by field rather than dumping whole rows: a
 * blanket select would leak other people's data through relations (an
 * instructor's email on a course, other students in a discussion) and would
 * silently start exporting any column added later.
 */
export async function exportUserData(userId: string) {
  // Run in small batches rather than one Promise.all of ten. A single export
  // otherwise claims ten connections at once, which is most of a pooled
  // Supabase client's budget and enough to exhaust a small local Postgres.
  // Export is not latency-critical, so a little serialisation is free.
  const [user, enrollments, attempts, submissions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          emailVerified: true,
          phone: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          profile: {
            select: {
              firstName: true, lastName: true, displayName: true, bio: true,
              profession: true, organizationName: true, country: true, phone: true,
              emergencyContact: true, xpPoints: true, currentStreak: true,
              longestStreak: true, learningMinutes: true, communicationPrefs: true,
            },
          },
          roles: { select: { role: { select: { name: true } }, assignedAt: true } },
        },
      }),
      prisma.enrollment.findMany({
        where: { userId },
        select: {
          status: true, progressPercent: true, enrolledAt: true, completedAt: true,
          course: { select: { title: true, slug: true } },
        },
      }),
      prisma.quizAttempt.findMany({
        where: { userId },
        select: {
          attemptNumber: true, status: true, score: true, maxScore: true, passed: true,
          submittedAt: true, quiz: { select: { title: true } },
        },
      }),
      prisma.submission.findMany({
        where: { userId },
        select: {
          status: true, grade: true, feedback: true, submittedAt: true, files: true,
          assignment: { select: { title: true } },
        },
      }),
  ]);

  const [certificates, consents, requests] = await Promise.all([
      prisma.certificate.findMany({
        where: { userId },
        select: {
          certificateNumber: true, credentialId: true, status: true,
          issuedAt: true, expiresAt: true, mintStatus: true,
        },
      }),
      prisma.consentLog.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { type: true, action: true, policyVersion: true, createdAt: true },
      }),
      prisma.dataSubjectRequest.findMany({
        where: { userId },
        select: { type: true, status: true, details: true, resolution: true, createdAt: true, handledAt: true },
      }),
  ]);

  const [notifications, wallets, payments] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        select: { channel: true, title: true, body: true, sentAt: true, readAt: true },
      }),
      prisma.wallet.findMany({
        where: { userId },
        select: { address: true, provider: true, chainKey: true, connectedAt: true },
      }),
      prisma.payment.findMany({
        where: { userId },
        select: { reference: true, provider: true, status: true, amountMinor: true, currency: true, paidAt: true },
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    format: "CopaServe data export v1",
    notice:
      "This file contains the personal data CopaServe holds about you. It excludes other people's data and internal records that do not describe you.",
    account: user,
    enrollments,
    quizAttempts: attempts,
    assignmentSubmissions: submissions,
    certificates,
    consentHistory: consents,
    dataSubjectRequests: requests,
    notifications,
    wallets,
    payments,
  };
}

export async function getDataRequests(userId: string) {
  return prisma.dataSubjectRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, status: true, details: true, resolution: true,
      createdAt: true, handledAt: true,
    },
  });
}

/**
 * Raise a data subject request.
 *
 * Refuses a duplicate of the same type while one is still open, so a person
 * cannot accidentally flood the compliance queue by clicking twice.
 */
export async function createDataRequest(
  userId: string,
  type: DataRequestType,
  details?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: "DUPLICATE" }> {
  const open = await prisma.dataSubjectRequest.findFirst({
    where: { userId, type, status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: { id: true },
  });

  if (open) return { ok: false, error: "DUPLICATE" };

  const request = await prisma.dataSubjectRequest.create({
    data: { userId, type, details: details?.trim() || null },
    select: { id: true },
  });

  return { ok: true, id: request.id };
}

export async function updateCommunicationPrefs(
  userId: string,
  prefs: Record<string, boolean>,
) {
  return prisma.profile.update({
    where: { userId },
    data: { communicationPrefs: prefs },
    select: { communicationPrefs: true },
  });
}

// ---------------------------------------------------------------------------
// Admin compliance view (§12.3)
// ---------------------------------------------------------------------------

export async function getAllDataRequests(status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED") {
  return prisma.dataSubjectRequest.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true, type: true, status: true, details: true, resolution: true,
      createdAt: true, handledAt: true,
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      handledBy: { select: { email: true } },
    },
  });
}

/**
 * Resolve a request.
 *
 * Every resolution writes an audit entry in the same transaction — how a
 * controller answered a rights request is exactly what an audit asks to see.
 */
export async function resolveDataRequest(
  actorId: string,
  requestId: string,
  status: "IN_PROGRESS" | "COMPLETED" | "REJECTED",
  resolution: string,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "INVALID" }> {
  if (!resolution.trim()) return { ok: false, error: "INVALID" };

  const request = await prisma.dataSubjectRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, type: true, userId: true },
  });
  if (!request) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: {
        status,
        resolution: resolution.trim(),
        handledById: actorId,
        handledAt: status === "IN_PROGRESS" ? null : new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: `data_request.${status.toLowerCase()}`,
        entityType: "DataSubjectRequest",
        entityId: requestId,
        before: { status: request.status },
        after: { status, type: request.type, resolution: resolution.trim() },
      },
    }),
  ]);

  return { ok: true };
}
