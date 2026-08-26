"use client";

import { useState, type FormEvent } from "react";

/**
 * Live "try a verification" widget (PRD §7.2 item 5).
 *
 * Calls the real /api/verify endpoint — the same one the QR codes point at —
 * so the homepage demonstrates the actual trust surface rather than a mock.
 */
type Result = {
  found: boolean;
  valid?: boolean;
  status?: string;
  studentName?: string;
  courseName?: string;
  institution?: string;
  instructorName?: string;
  certificateNumber?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  mintStatus?: string;
  revocationReason?: string | null;
  message?: string;
};

export function VerifyWidget() {
  const [credentialId, setCredentialId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!credentialId.trim()) return;

    setPending(true);
    setResult(null);

    try {
      const response = await fetch(`/api/verify/${encodeURIComponent(credentialId.trim())}`);
      setResult((await response.json()) as Result);
    } catch {
      setResult({ found: false, message: "Verification is temporarily unavailable." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="credential-id">
          Certificate ID
        </label>
        <input
          id="credential-id"
          value={credentialId}
          onChange={(event) => setCredentialId(event.target.value)}
          placeholder="Enter a certificate ID, e.g. CERT-2026-000123"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </form>

      {result && (
        <div role="status" className="mt-6 rounded-xl border border-border bg-surface p-5">
          {!result.found ? (
            <p className="text-sm font-medium text-danger">
              {result.message ?? "No certificate matches this credential ID."}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    result.valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  }`}
                >
                  {result.valid ? "Valid" : (result.status ?? "Invalid")}
                </span>
                {result.mintStatus && result.mintStatus !== "NOT_MINTED" && (
                  <span className="inline-flex items-center rounded-full bg-brand-pale px-3 py-1 text-xs font-semibold text-brand">
                    {result.mintStatus.replaceAll("_", " ").toLowerCase()}
                  </span>
                )}
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Holder" value={result.studentName} />
                <Detail label="Course" value={result.courseName} />
                <Detail label="Institution" value={result.institution} />
                <Detail label="Instructor" value={result.instructorName} />
                <Detail label="Certificate ID" value={result.certificateNumber} />
                <Detail label="Issued" value={formatDate(result.issueDate)} />
                {result.expiryDate && <Detail label="Expires" value={formatDate(result.expiryDate)} />}
              </dl>

              {result.revocationReason && (
                <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  Revoked: {result.revocationReason}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}
