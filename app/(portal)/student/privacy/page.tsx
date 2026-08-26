import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import {
  getConsentHistory,
  getConsentState,
  getDataRequests,
  MANAGEABLE_CONSENTS,
} from "@/lib/privacy";
import { requestDataAction, setCommunicationPrefsAction, setConsentAction } from "./actions";

export const metadata: Metadata = { title: "Privacy" };

const CONSENT_LABELS: Record<string, string> = {
  MARKETING_EMAIL: "Marketing emails",
  MARKETING_SMS: "Marketing SMS",
  COOKIES: "Non-essential cookies",
  PRIVACY_NOTICE: "Privacy notice",
  TERMS_OF_SERVICE: "Terms of service",
  DATA_PROCESSING: "Data processing",
};

const REQUEST_LABELS: Record<string, string> = {
  ACCESS: "Access my data",
  CORRECTION: "Correct my data",
  ERASURE: "Delete my account",
  PORTABILITY: "Port my data",
  OBJECTION: "Object to processing",
  WITHDRAW_CONSENT: "Withdraw consent",
};

/** Student Privacy Centre (PRD §12.2). */
export default async function PrivacyPage() {
  const user = await requireUser("/student/privacy");

  const [consents, history, requests, profile] = await Promise.all([
    getConsentState(user.id),
    getConsentHistory(user.id, 25),
    getDataRequests(user.id),
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: { communicationPrefs: true },
    }),
  ]);

  const prefs = (profile?.communicationPrefs ?? {}) as Record<string, boolean>;
  const openRequestTypes = new Set(
    requests.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS").map((r) => r.type),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-1 text-muted-foreground">
          Your data, your consent, and your rights under the Nigeria Data Protection Act.
        </p>
      </header>

      {/* Download my data (§12.2) */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Download my data</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A machine-readable copy of everything we hold about you: your profile, enrolments,
          quiz attempts, submissions, certificates, and consent history.
        </p>
        <a
          href="/api/privacy/export"
          className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Download JSON
        </a>
      </section>

      {/* Consent (§12.1) */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Consent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Withdrawing consent takes effect immediately. Your consent history is kept as a record —
          withdrawing adds an entry rather than erasing what came before.
        </p>

        <ul className="mt-4 divide-y divide-border">
          {consents.map((consent) => {
            const manageable = MANAGEABLE_CONSENTS.includes(consent.type);
            return (
              <li key={consent.type} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{CONSENT_LABELS[consent.type] ?? consent.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {consent.granted ? "Granted" : "Not granted"}
                    {consent.updatedAt
                      ? ` · updated ${consent.updatedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}`
                      : ""}
                  </p>
                </div>

                {manageable ? (
                  <form action={setConsentAction}>
                    <input type="hidden" name="type" value={consent.type} />
                    <input type="hidden" name="grant" value={String(!consent.granted)} />
                    <button
                      type="submit"
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        consent.granted
                          ? "border border-border hover:bg-surface-muted"
                          : "bg-brand text-white hover:brightness-110"
                      }`}
                    >
                      {consent.granted ? "Withdraw" : "Grant"}
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">Required for the service</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Communication preferences (§12.2) */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Communication preferences</h2>
        <form action={setCommunicationPrefsAction} className="mt-4 space-y-3">
          {[
            { id: "IN_APP", label: "In-app notifications" },
            { id: "EMAIL", label: "Email" },
            { id: "SMS", label: "SMS" },
            { id: "PUSH", label: "Push notifications" },
          ].map((channel) => (
            <label key={channel.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={channel.id}
                defaultChecked={prefs[channel.id] ?? channel.id === "IN_APP"}
                className="accent-[var(--brand-green)]"
              />
              {channel.label}
            </label>
          ))}
          <button
            type="submit"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Save preferences
          </button>
        </form>
      </section>

      {/* Data subject rights (§12.1) */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Exercise your rights</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Correction, erasure, and objection requests are reviewed by our compliance team. Some
          records — certificates and audit trails — must be retained by law even after an erasure
          request, and we will tell you exactly what was kept and why.
        </p>

        <form action={requestDataAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Request type</span>
            <select
              name="type"
              defaultValue="CORRECTION"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand sm:max-w-xs"
            >
              {["CORRECTION", "ERASURE", "OBJECTION", "ACCESS", "PORTABILITY"].map((type) => (
                <option key={type} value={type} disabled={openRequestTypes.has(type as never)}>
                  {REQUEST_LABELS[type]}
                  {openRequestTypes.has(type as never) ? " (already open)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Details</span>
            <textarea
              name="details"
              rows={3}
              placeholder="Tell us what you would like corrected, erased, or objected to."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
          >
            Submit request
          </button>
        </form>

        {requests.length > 0 && (
          <ul className="mt-6 divide-y divide-border border-t border-border">
            {requests.map((request) => (
              <li key={request.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{REQUEST_LABELS[request.type] ?? request.type}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      request.status === "COMPLETED"
                        ? "bg-success/10 text-success"
                        : request.status === "REJECTED"
                          ? "bg-danger/10 text-danger"
                          : "bg-warning/10 text-warning"
                    }`}
                  >
                    {request.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Raised {request.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </p>
                {request.resolution && (
                  <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">{request.resolution}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Consent history (§12.2) */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">Consent history</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No consent activity recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{CONSENT_LABELS[entry.type] ?? entry.type}</span>
                <span className="text-muted-foreground">
                  {entry.action.toLowerCase()} ·{" "}
                  {entry.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
