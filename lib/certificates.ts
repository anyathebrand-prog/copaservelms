import type { PrismaClient } from "@/app/generated/prisma/client";

/**
 * Public certificate verification (PRD §11.3).
 *
 * This is the privileged read that `certificates` has no RLS policy for: a
 * public-read policy would let anyone enumerate every credential and its
 * holder, so verification is funnelled through this single-credential lookup
 * that returns only the fields §11.3 lists.
 */

export const INSTITUTION_NAME =
  process.env.NEXT_PUBLIC_INSTITUTION_NAME ?? "Business Intelligence Technologies Limited";

export type VerificationResult =
  | { found: false }
  | {
      found: true;
      valid: boolean;
      status: "ISSUED" | "EXPIRED" | "REVOKED" | "PENDING_APPROVAL";
      studentName: string;
      courseName: string;
      institution: string;
      instructorName: string;
      certificateNumber: string;
      credentialId: string;
      issueDate: string | null;
      expiryDate: string | null;
      mintStatus: string;
      transactionHash: string | null;
      explorerUrl: string | null;
      pdfUrl: string | null;
      revokedAt: string | null;
      revocationReason: string | null;
    };

/**
 * Look up one credential by its public id.
 *
 * Accepts either the credentialId or the printed certificate number, since a
 * person reading a certificate cannot tell which is which.
 */
export async function verifyCredential(
  db: PrismaClient,
  rawId: string,
): Promise<VerificationResult> {
  const id = rawId.trim();

  // Bound the input before it reaches the database. Credential ids are opaque
  // and short; anything else is a probe, not a lookup.
  if (!id || id.length > 128) return { found: false };

  const certificate = await db.certificate.findFirst({
    where: { OR: [{ credentialId: id }, { certificateNumber: id }] },
    select: {
      status: true,
      certificateNumber: true,
      credentialId: true,
      issuedAt: true,
      expiresAt: true,
      pdfUrl: true,
      mintStatus: true,
      revokedAt: true,
      revocationReason: true,
      mintTransaction: { select: { transactionHash: true, explorerUrl: true } },
      user: { select: { profile: { select: { displayName: true, firstName: true, lastName: true } } } },
      enrollment: {
        select: {
          course: {
            select: {
              title: true,
              instructor: { select: { profile: { select: { displayName: true, firstName: true, lastName: true } } } },
            },
          },
        },
      },
    },
  });

  if (!certificate) return { found: false };

  // A pending certificate has not been issued, so it must not present as a
  // real credential — but it still resolves, so admins can trace it.
  const holder = certificate.user.profile;
  const instructor = certificate.enrollment.course.instructor.profile;

  // Expiry is evaluated at read time. A certificate that lapsed since issuance
  // is stored as ISSUED but must verify as expired (PRD §11.2 optional expiry).
  const expired =
    certificate.expiresAt !== null && certificate.expiresAt.getTime() < Date.now();

  const status = certificate.status === "ISSUED" && expired ? "EXPIRED" : certificate.status;

  return {
    found: true,
    // Revocation is reflected instantly because this reads the row live on every
    // request — no caching layer sits in front of it (PRD §11.4).
    valid: status === "ISSUED",
    status,
    studentName: formatName(holder),
    courseName: certificate.enrollment.course.title,
    institution: INSTITUTION_NAME,
    instructorName: formatName(instructor),
    certificateNumber: certificate.certificateNumber,
    credentialId: certificate.credentialId,
    issueDate: certificate.issuedAt?.toISOString() ?? null,
    expiryDate: certificate.expiresAt?.toISOString() ?? null,
    mintStatus: certificate.mintStatus,
    transactionHash: certificate.mintTransaction?.transactionHash ?? null,
    explorerUrl: certificate.mintTransaction?.explorerUrl ?? null,
    // Only issued certificates offer a download; a revoked PDF should not spread.
    pdfUrl: status === "ISSUED" ? certificate.pdfUrl : null,
    revokedAt: certificate.revokedAt?.toISOString() ?? null,
    revocationReason: certificate.revocationReason,
  };
}

function formatName(
  profile: { displayName: string | null; firstName: string; lastName: string } | null,
): string {
  if (!profile) return "Unknown";
  return profile.displayName?.trim() || `${profile.firstName} ${profile.lastName}`.trim();
}
