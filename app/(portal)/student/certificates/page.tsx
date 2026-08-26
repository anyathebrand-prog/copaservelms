import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getStudentCertificates } from "@/lib/student";

export const metadata: Metadata = { title: "Certificates" };

const VERIFY_BASE =
  process.env.NEXT_PUBLIC_VERIFICATION_BASE_URL ?? "https://verify.copaserve.ng";

export default async function CertificatesPage() {
  const user = await requireUser("/student/certificates");
  const certificates = await getStudentCertificates(user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Certificates</h1>
        <p className="mt-1 text-muted-foreground">
          Every certificate is publicly verifiable by its credential ID.
        </p>
      </header>

      {certificates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Complete a course to earn your first certificate.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {certificates.map((certificate) => (
            <li key={certificate.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display font-semibold">{certificate.enrollment.course.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    certificate.status === "ISSUED"
                      ? "bg-success/10 text-success"
                      : certificate.status === "REVOKED"
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {certificate.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>

              <dl className="mt-4 space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>Certificate ID</dt>
                  <dd className="font-mono text-xs">{certificate.certificateNumber}</dd>
                </div>
                {certificate.issuedAt && (
                  <div className="flex justify-between gap-3">
                    <dt>Issued</dt>
                    <dd>{certificate.issuedAt.toLocaleDateString("en-NG")}</dd>
                  </div>
                )}
                {certificate.expiresAt && (
                  <div className="flex justify-between gap-3">
                    <dt>Expires</dt>
                    <dd>{certificate.expiresAt.toLocaleDateString("en-NG")}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {/* Only issued certificates expose a download (§11.4). */}
                {certificate.status === "ISSUED" && certificate.pdfUrl && (
                  <a
                    href={certificate.pdfUrl}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Download PDF
                  </a>
                )}
                <a
                  href={`${VERIFY_BASE}/${certificate.credentialId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                >
                  Verification page ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
