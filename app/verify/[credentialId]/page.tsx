import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyCredential } from "@/lib/certificates";
import { Logo } from "@/components/layout/logo";

/**
 * Public certificate verification page (PRD §11.3).
 *
 * This is where the QR code on every certificate points. It is deliberately
 * unauthenticated and deliberately a page rather than the JSON endpoint: the
 * person scanning is usually an employer or a regulator who wants to read an
 * answer, not parse a payload.
 *
 * Revocation must be visible immediately (§11.4), so nothing here is cached.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}): Promise<Metadata> {
  const { credentialId } = await params;
  const result = await verifyCredential(prisma, credentialId);

  return {
    title: result.found ? `Certificate ${result.certificateNumber}` : "Certificate not found",
    // Verification results should not be indexed: each page is about one
    // named person, and a search engine has no business listing them.
    robots: { index: false, follow: false },
  };
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  const { credentialId } = await params;
  const result = await verifyCredential(prisma, credentialId);

  return (
    <div className="flex min-h-dvh flex-col bg-brand-pale/30">
      <header className="p-6">
        <Link href="/" className="inline-flex">
          <Logo height={28} />
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="w-full max-w-xl">
          {!result.found ? (
            <div className="glass-panel rounded-2xl p-8 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger/10 text-2xl text-danger">
                ✕
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
                No certificate found
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                No certificate matches this credential ID. Check the ID and try again, or contact
                the issuing institution.
              </p>
              <p className="mt-4 break-all font-mono text-xs text-muted-foreground">{credentialId}</p>
            </div>
          ) : (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div
                className={`px-8 py-6 text-center ${
                  result.valid ? "bg-success/10" : "bg-danger/10"
                }`}
              >
                <div
                  className={`mx-auto flex size-14 items-center justify-center rounded-full text-2xl ${
                    result.valid ? "bg-success text-white" : "bg-danger text-white"
                  }`}
                >
                  {result.valid ? "✓" : "!"}
                </div>
                <h1
                  className={`mt-4 font-display text-2xl font-bold tracking-tight ${
                    result.valid ? "text-success" : "text-danger"
                  }`}
                >
                  {result.valid
                    ? "Valid certificate"
                    : result.status === "REVOKED"
                      ? "Certificate revoked"
                      : result.status === "EXPIRED"
                        ? "Certificate expired"
                        : "Not yet issued"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.valid
                    ? "This credential is genuine and currently in good standing."
                    : result.status === "REVOKED"
                      ? "This credential was issued but has since been withdrawn."
                      : result.status === "EXPIRED"
                        ? "This credential was genuine but has passed its expiry date."
                        : "This credential has not been issued yet."}
                </p>
              </div>

              <dl className="divide-y divide-border bg-surface px-8">
                <Row label="Holder" value={result.studentName} />
                <Row label="Course" value={result.courseName} />
                <Row label="Institution" value={result.institution} />
                <Row label="Instructor" value={result.instructorName} />
                <Row label="Certificate number" value={result.certificateNumber} mono />
                <Row label="Credential ID" value={result.credentialId} mono />
                <Row label="Issued" value={formatDate(result.issueDate)} />
                {result.expiryDate && <Row label="Expires" value={formatDate(result.expiryDate)} />}
                {result.mintStatus !== "NOT_MINTED" && (
                  <Row label="Blockchain" value={result.mintStatus.replaceAll("_", " ").toLowerCase()} />
                )}
              </dl>

              {result.revocationReason && (
                <div className="bg-surface px-8 pb-6">
                  <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                    <span className="font-medium">Reason for revocation:</span>{" "}
                    {result.revocationReason}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 border-t border-border bg-surface px-8 py-6">
                {/* Only a valid certificate offers its document (§11.4). */}
                {result.valid && result.pdfUrl && (
                  <a
                    href={result.pdfUrl}
                    className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Download certificate
                  </a>
                )}
                {result.transactionHash && result.explorerUrl && (
                  <a
                    href={result.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
                  >
                    View on-chain ↗
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Verified by CopaServe on behalf of Business Intelligence Technologies Limited.
            <br />
            Anyone can check a certificate at this address — no account required.
          </p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
