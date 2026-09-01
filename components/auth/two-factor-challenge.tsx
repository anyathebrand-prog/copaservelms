"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Enter the code from an authenticator app.
 *
 * Supabase raises the session's assurance level on success, which is what every
 * other page checks. Nothing here decides whether the user is allowed in — it
 * only lets them finish proving it.
 */
export function TwoFactorChallenge() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = searchParams.get("next") ?? "/portal";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";

  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();

      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.find((entry) => entry.status === "verified");

      if (listError || !factor) {
        setPending(false);
        setError("We could not find an authenticator on this account.");
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: code.trim(),
      });

      if (verifyError) {
        setPending(false);
        // The same message whether the code is wrong or simply late: which of
        // the two it was tells an attacker something and the owner nothing.
        setError("That code was not accepted. Codes change every 30 seconds — try the current one.");
        setCode("");
        return;
      }

      router.replace(safeNext);
      router.refresh();
    } catch {
      setPending(false);
      setError("Something went wrong. Please try again.");
    }
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="glass-panel rounded-2xl p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">One more step</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the six-digit code from your authenticator app.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="sr-only">Authentication code</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full rounded-lg border border-border bg-surface px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || code.length < 6}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Checking..." : "Verify"}
        </button>
      </form>

      <button
        type="button"
        onClick={signOut}
        className="mt-6 w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
      >
        Sign in as someone else
      </button>
    </div>
  );
}
