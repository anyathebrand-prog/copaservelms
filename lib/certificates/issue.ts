import { prisma } from "@/lib/prisma";
import { verificationBase } from "@/lib/app-url";
import { getStorage } from "@/lib/storage";
import { sendNotification } from "@/lib/notifications";
import { evaluateBadges, recordActivity, XP } from "@/lib/gamification";
import { evaluateEligibility } from "./eligibility";
import { renderCertificatePdf } from "./pdf";

/**
 * Certificate issuance (PRD §11.1) and revocation (§11.4).
 *
 * Order matters here. The PDF is rendered and stored *before* the certificate
 * row is written, so a storage failure leaves no certificate record pointing at
 * a file that does not exist. A student seeing a certificate they cannot open
 * is worse than not seeing one yet.
 */

export const INSTITUTION_NAME =
  process.env.NEXT_PUBLIC_INSTITUTION_NAME || "Business Intelligence Technologies Limited";

const VERIFY_BASE = verificationBase();

export type IssueError =
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "ALREADY_ISSUED"
  | "FORBIDDEN"
  | "STORAGE_FAILED";

export type IssueResult =
  | { ok: true; certificateId: string; certificateNumber: string; credentialId: string }
  | { ok: false; error: IssueError; message?: string };

/**
 * Issue a certificate for an enrolment.
 *
 * `overrideApproval` is the admin/instructor manual-issue path (§10.4): it
 * satisfies the approval condition but never the others. An admin cannot issue
 * a certificate to someone who has not done the work.
 */
export async function issueCertificate(
  enrollmentId: string,
  options: { actorId?: string | null; overrideApproval?: boolean } = {},
): Promise<IssueResult> {
  const eligibility = await evaluateEligibility(enrollmentId);
  if (!eligibility) return { ok: false, error: "NOT_FOUND" };
  if (eligibility.alreadyIssued) return { ok: false, error: "ALREADY_ISSUED" };

  const satisfied =
    eligibility.eligible || (options.overrideApproval && eligibility.awaitingApproval);

  if (!satisfied) {
    const outstanding = eligibility.conditions
      .filter((c) => c.applicable && !c.met)
      .map((c) => `${c.label} (${c.detail})`)
      .join("; ");
    return { ok: false, error: "NOT_ELIGIBLE", message: outstanding };
  }

  const enrollment = await prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: {
      userId: true,
      course: {
        select: {
          title: true,
          templateId: true,
          certificateValidMonths: true,
          instructor: {
            select: { profile: { select: { firstName: true, lastName: true, displayName: true } } },
          },
        },
      },
    },
  });

  const certificateNumber = await nextCertificateNumber();
  const credentialId = generateCredentialId();
  const verificationUrl = `${VERIFY_BASE}/${credentialId}`;
  const issuedAt = new Date();
  const expiresAt = enrollment.course.certificateValidMonths
    ? new Date(new Date(issuedAt).setMonth(issuedAt.getMonth() + enrollment.course.certificateValidMonths))
    : null;

  const instructorProfile = enrollment.course.instructor.profile;

  let pdfUrl: string;
  let storageKey: string;

  try {
    const pdf = await renderCertificatePdf({
      studentName: eligibility.studentName,
      courseName: enrollment.course.title,
      instructorName:
        instructorProfile?.displayName?.trim() ||
        `${instructorProfile?.firstName ?? ""} ${instructorProfile?.lastName ?? ""}`.trim() ||
        INSTITUTION_NAME,
      institutionName: INSTITUTION_NAME,
      certificateNumber,
      credentialId,
      issueDate: issuedAt,
      expiryDate: expiresAt,
      verificationUrl,
    });

    storageKey = `${enrollment.userId}/${certificateNumber}.pdf`;
    const stored = await getStorage().upload(storageKey, pdf, "application/pdf");
    pdfUrl = stored.url;
  } catch (error) {
    // Nothing has been written to the database yet, so there is nothing to
    // unwind — the enrolment simply remains without a certificate.
    return {
      ok: false,
      error: "STORAGE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const certificate = await prisma.$transaction(async (tx) => {
    const created = await tx.certificate.create({
      data: {
        certificateNumber,
        credentialId,
        userId: enrollment.userId,
        enrollmentId,
        templateId: enrollment.course.templateId,
        status: "ISSUED",
        issuedAt,
        expiresAt,
        pdfUrl,
        verificationUrl,
        mintStatus: "MINT_ELIGIBLE",
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: options.actorId ?? null,
        action: options.overrideApproval ? "certificate.issue.manual" : "certificate.issue",
        entityType: "Certificate",
        entityId: created.id,
        after: { certificateNumber, credentialId, course: enrollment.course.title, storageKey },
      },
    });

    return created;
  });

  // §11.1: the certificate is emailed on issuance. Delivery failure must not
  // fail issuance — the certificate is valid, stored, and in the dashboard.
  await sendNotification({
    userId: enrollment.userId,
    kind: "certificate.issued",
    title: `Your certificate for ${enrollment.course.title}`,
    body:
      `Congratulations — your certificate has been issued. ` +
      `Certificate number ${certificateNumber}. It can be verified by anyone at ${verificationUrl}.`,
    actionUrl: "/student/certificates",
    channels: ["EMAIL"],
    metadata: { certificateNumber, credentialId },
  }).catch(() => {});

  await recordActivity(enrollment.userId, XP.CERTIFICATE_EARNED).catch(() => {});
  await evaluateBadges(enrollment.userId).catch(() => {});

  return { ok: true, certificateId: certificate.id, certificateNumber, credentialId };
}

/**
 * Revoke a certificate (PRD §11.4).
 *
 * The row is updated, never deleted: the verification page must keep resolving
 * the credential and report it as revoked. A credential that 404s after
 * revocation is indistinguishable from one that never existed.
 */
export async function revokeCertificate(
  certificateId: string,
  actorId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "INVALID" }> {
  if (!reason.trim()) return { ok: false, error: "INVALID" };

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: { id: true, status: true, certificateNumber: true },
  });
  if (!certificate) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: actorId,
        revocationReason: reason.trim(),
        mintStatus: "REVOKED",
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: "certificate.revoke",
        entityType: "Certificate",
        entityId: certificateId,
        before: { status: certificate.status },
        after: { status: "REVOKED", certificateNumber: certificate.certificateNumber, reason: reason.trim() },
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Next certificate number, in the §11.3 pattern CERT-YYYY-NNNNNN.
 *
 * Sequence is per year and derived from the highest existing number, so the
 * counter restarts each January rather than growing forever.
 */
async function nextCertificateNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CERT-${year}-`;

  const latest = await prisma.certificate.findFirst({
    where: { certificateNumber: { startsWith: prefix } },
    orderBy: { certificateNumber: "desc" },
    select: { certificateNumber: true },
  });

  const sequence = latest ? Number(latest.certificateNumber.slice(prefix.length)) + 1 : 1;

  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

/**
 * Opaque public credential id.
 *
 * Deliberately not the certificate number: the number is sequential and would
 * let anyone enumerate every credential by counting. This is random.
 */
function generateCredentialId(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
