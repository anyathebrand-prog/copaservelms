"use client";

import { useState } from "react";
import { createApiKeyAction } from "@/app/(portal)/admin/api-keys/actions";

/**
 * Issue an API key and show it once.
 *
 * The plaintext exists only in this response. It is rendered here, with a copy
 * control and an explicit warning, because the alternative — storing something
 * retrievable — would mean the credential lives in two places instead of one.
 */
const SCOPES = [
  { id: "VERIFY_READ", label: "Verify certificates", hint: "Read verification data for any credential." },
  { id: "ORG_READ", label: "Read organisation progress", hint: "Completion data for one organisation." },
  { id: "ORG_WRITE", label: "Enrol organisation members", hint: "Enrol that organisation's staff." },
];

export function ApiKeyForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setIssued(null);

    try {
      const result = await createApiKeyAction(formData);
      if (result.ok) setIssued(result.key);
      else setError(result.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That key could not be created.");
    } finally {
      setPending(false);
    }
  }

  if (issued) {
    return (
      <div className="rounded-2xl border border-brand/40 bg-brand-pale/30 p-6">
        <h3 className="font-display font-semibold text-brand">Key created</h3>
        <p className="mt-2 text-sm">
          Copy it now. It is stored only as a hash, so this is the one time it can be shown — if it
          is lost, the key has to be revoked and replaced.
        </p>

        <code className="mt-4 block overflow-x-auto rounded-lg bg-surface px-4 py-3 font-mono text-sm">
          {issued}
        </code>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(issued).catch(() => {});
              setCopied(true);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIssued(null);
              setCopied(false);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={handle} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <h3 className="font-display text-xl font-semibold">New API key</h3>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Name</span>
        <input
          name="name"
          required
          placeholder="First Bank HR integration"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
      </label>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Scopes</legend>
        <div className="space-y-2">
          {SCOPES.map((scope) => (
            <label key={scope.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={scope.id}
                className="mt-1 accent-[var(--brand-green)]"
              />
              <span>
                {scope.label}
                <span className="block text-xs text-muted-foreground">{scope.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Organisation</span>
        <select
          name="organizationId"
          defaultValue=""
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        >
          <option value="">None — platform-wide</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          Required for organisation scopes, which are limited to that organisation&rsquo;s data.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Expires (optional)</span>
        <input
          type="date"
          name="expiresAt"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
      </label>

      {error && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create key"}
      </button>
    </form>
  );
}
