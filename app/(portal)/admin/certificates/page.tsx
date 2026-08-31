import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { findIssuableEnrollments } from "@/lib/certificates/eligibility";
import { isStorageConfigured } from "@/lib/storage";
import { issueCertificateAction, revokeCertificateAction } from "./actions";

export const metadata: Metadata = { title: "Certificates" };

/** Certificate issuance and revocation (PRD §11.1, §11.4). */
export default async function AdminCertificatesPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/certificates");

  const [issuable, issued, storageReady] = await Promise.all([
    findIssuableEnrollments(),
    prisma.certificate.findMany({
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: {
        id: true,
        certificateNumber: true,
        credentialId: true,
        status: true,
        issuedAt: true,
        revocationReason: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        enrollment: { select: { course: { select: { title: true } } } },
      },
    }),
    Promise.resolve(isStorageConfigured()),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Certificates</h1>
        <p className="mt-1 text-muted-foreground">
          Issue certificates to students who have met every condition, and revoke where necessary.
        </p>
      </header>

      {!storageReady && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
          Storage is not configured, so issuance will fail. Set{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          and create the <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">certificates</code>{" "}
          bucket in Supabase Storage.
        </p>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">Ready to issue</h2>

        {issuable.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No enrolments currently meet the conditions for a certificate.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {issuable.map((candidate) => (
              <li key={candidate.enrollmentId} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{candidate.studentName}</p>
                    <p className="text-sm text-muted-foreground">{candidate.courseTitle}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      candidate.eligible ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}
                  >
                    {candidate.eligible ? "eligible" : "awaiting approval"}
                  </span>
                </div>

                <ul className="mt-3 flex flex-wrap gap-2">
                  {candidate.conditions
                    .filter((condition) => condition.applicable)
                    .map((condition) => (
                      <li
                        key={condition.id}
                        className={`rounded-full px-3 py-1 text-xs ${
                          condition.met
                            ? "bg-surface-muted text-muted-foreground"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {condition.met ? "✓" : "•"} {condition.label} — {condition.detail}
                      </li>
                    ))}
                </ul>

                <form action={issueCertificateAction} className="mt-4">
                  <input type="hidden" name="enrollmentId" value={candidate.enrollmentId} />
                  <SubmitButton pendingLabel="Working..."
                    disabled={!storageReady}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    Issue certificate
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Issued</h2>

        {issued.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No certificates have been issued yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {issued.map((certificate) => (
              <li key={certificate.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {certificate.user.profile?.firstName} {certificate.user.profile?.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {certificate.enrollment.course.title}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {certificate.certificateNumber} · {certificate.credentialId}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      certificate.status === "ISSUED"
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {certificate.status.toLowerCase()}
                  </span>
                </div>

                {certificate.revocationReason ? (
                  <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                    Revoked: {certificate.revocationReason}
                  </p>
                ) : (
                  <form action={revokeCertificateAction} className="mt-4 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="certificateId" value={certificate.id} />
                    <label className="min-w-48 flex-1">
                      <span className="mb-1.5 block text-sm font-medium">Revocation reason</span>
                      <input
                        name="reason"
                        required
                        placeholder="Academic misconduct, expiry, administrative correction…"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                      />
                    </label>
                    <SubmitButton pendingLabel="Working..."
                      className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
                    >
                      Revoke
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
