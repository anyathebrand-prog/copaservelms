"use client";

import { useState } from "react";
import { createEndpointAction } from "@/app/(portal)/admin/webhooks/actions";

/**
 * Register an endpoint and show its signing secret once.
 *
 * The secret is what lets a partner tell our deliveries from anyone else's, so
 * it is displayed with the verification recipe rather than left as something
 * they have to ask about.
 */
const EVENTS = [
  { id: "CERTIFICATE_ISSUED", label: "certificate.issued" },
  { id: "CERTIFICATE_REVOKED", label: "certificate.revoked" },
  { id: "ENROLMENT_CREATED", label: "enrolment.created" },
  { id: "PAYMENT_SUCCEEDED", label: "payment.succeeded" },
  { id: "COURSE_PUBLISHED", label: "course.published" },
];

export function WebhookForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setSecret(null);

    try {
      const result = await createEndpointAction(formData);
      if (result.ok) setSecret(result.secret);
      else setError(result.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That endpoint could not be created.");
    } finally {
      setPending(false);
    }
  }

  if (secret) {
    return (
      <div className="rounded-2xl border border-brand/40 bg-brand-pale/30 p-6">
        <h3 className="font-display font-semibold text-brand">Endpoint created</h3>
        <p className="mt-2 text-sm">
          Give this signing secret to whoever owns the receiving endpoint. It is shown once.
        </p>

        <code className="mt-4 block overflow-x-auto rounded-lg bg-surface px-4 py-3 font-mono text-sm">
          {secret}
        </code>

        <div className="mt-4 rounded-lg bg-surface px-4 py-3 text-sm">
          <p className="font-medium">How they verify a delivery</p>
          <p className="mt-1 text-muted-foreground">
            Each request carries <code className="text-xs">X-CopaServe-Timestamp</code> and{" "}
            <code className="text-xs">X-CopaServe-Signature</code>. The signature is
            HMAC-SHA256 of <code className="text-xs">{"{timestamp}.{raw body}"}</code> using this
            secret. Reject anything older than five minutes, and compare in constant time.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSecret(null)}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={handle} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <h3 className="font-display text-xl font-semibold">New endpoint</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="Acme HR system"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Organisation</span>
          <select
            name="organizationId"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          >
            <option value="">All activity</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} only
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">URL</span>
        <input
          name="url"
          type="url"
          required
          placeholder="https://partner.example.com/hooks/copaserve"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Must be https — deliveries carry names and course records.
        </span>
      </label>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Events</legend>
        <div className="flex flex-wrap gap-3">
          {EVENTS.map((event) => (
            <label key={event.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="events"
                value={event.id}
                className="accent-[var(--brand-green)]"
              />
              <code className="text-xs">{event.label}</code>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create endpoint"}
      </button>
    </form>
  );
}
