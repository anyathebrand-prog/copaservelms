"use client";

import { useState, type FormEvent } from "react";

/**
 * Live "try a verification" widget (PRD §7.2 item 5).
 *
 * Calls the real /api/verify endpoint — the same one the QR codes point at —
 * so the homepage demonstrates the actual trust surface rather than a mock.
 *
 * Styled for the dark band it sits on, and deliberately has no container of
 * its own: a panel around the field would just be a lighter rectangle on the
 * ink. The field is the invitation, and the result panel appears only once
 * there is a result to put in it.
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
    <div>
      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="credential-id">
          Certificate ID
        </label>
        <input
          id="credential-id"
          value={credentialId}
          onChange={(event) => setCredentialId(event.target.value)}
          placeholder="Enter a certificate ID, e.g. CERT-2026-000123"
          className="flex-1 rounded-full border border-white/20 bg-white/5 px-6 py-4 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/35 focus:border-brand-bright/60 focus:bg-white/10"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-bright px-7 py-4 text-sm font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </form>

      {result && (
        <div role="status" className="glass-dark mt-6 max-w-2xl rounded-3xl p-6">
          {!result.found ? (
            <p className="text-sm font-medium text-warning">
              {result.message ?? "No certificate matches this credential ID."}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    result.valid
                      ? "bg-brand-bright/15 text-brand-bright"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {result.valid ? "Valid" : (result.status ?? "Invalid")}
                </span>
                {result.mintStatus && result.mintStatus !== "NOT_MINTED" && (
                  <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
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
                <p className="mt-4 rounded-xl bg-warning/10 px-4 py-2.5 text-sm text-warning">
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
      <dt className="text-xs uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 font-medium text-white">{value}</dd>
    </div>
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}
