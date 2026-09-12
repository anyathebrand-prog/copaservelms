/**
 * Issue a certificate the moment it is earned.
 *
 * Shared rather than owned by one caller, because a certificate is earned by
 * whichever action completes the last outstanding condition — and that is not
 * always the last lesson. It used to live inside markLessonComplete, so a
 * learner who finished the lessons and then passed the quiz met every
 * condition and received nothing: the only code that could issue had already
 * run, before the quiz existed to pass.
 *
 * Never throws. A certificate that fails to render must not undo the lesson or
 * the quiz attempt that earned it — that progress is real either way, and an
 * administrator can still issue by hand from the certificates page.
 *
 * Imported lazily inside the function because the issuance path pulls in PDF
 * rendering, storage and webhooks, none of which belong in the module graph of
 * every page that reads a learner's progress.
 */
export type IssuedCertificate = { certificateId: string; credentialId: string };

export async function autoIssueCertificate(
  enrollmentId: string,
): Promise<IssuedCertificate | null> {
  try {
    const { evaluateEligibility } = await import("@/lib/certificates/eligibility");
    const eligibility = await evaluateEligibility(enrollmentId);

    if (!eligibility || eligibility.alreadyIssued) return null;

    // awaitingApproval means the only thing missing is a human, and that human
    // is the whole reason the course asked for approval.
    if (!eligibility.eligible || eligibility.awaitingApproval) return null;

    const { issueCertificate } = await import("@/lib/certificates/issue");
    const result = await issueCertificate(enrollmentId, {});

    if (!result.ok) return null;
    return { certificateId: result.certificateId, credentialId: result.credentialId };
  } catch (cause) {
    console.error("[certificates] automatic issuance failed", cause);
    return null;
  }
}
