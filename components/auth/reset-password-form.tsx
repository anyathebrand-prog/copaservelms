"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password";

/**
 * Set a new password from a recovery link.
 *
 * By the time this renders, /auth/callback has already exchanged the one-time
 * code for a session — so the only question left is whether that worked. A
 * link that was opened in a different browser, used twice, or left for a day
 * has no session behind it, and saying so plainly beats a form that accepts a
 * password and then fails.
 *
 * Note that this does not get anyone past two-factor. The session a recovery
 * link creates is aal1, and getCurrentUser refuses aal1 for anyone who has
 * enrolled a factor — so a stolen inbox can change the password and still not
 * reach the portal.
 */
export function ResetPasswordForm() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function establish() {
      const supabase = createSupabaseBrowserClient();

      // An implicit-flow link puts the tokens in the fragment, which the
      // server never sees — /auth/callback forwards such a request here
      // untouched precisely so this can pick them up.
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .catch(() => undefined);

        // Take the tokens out of the address bar: they are credentials, and
        // they should not sit in history or leak through a shared URL.
        window.history.replaceState(null, "", window.location.pathname);
      }

      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      setValid(Boolean(data.user));
      setChecking(false);
    }

    establish().catch(() => {
      if (!cancelled) setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const problem = validateNewPassword(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: failure } = await supabase.auth.updateUser({ password });

      if (failure) {
        setError(failure.message);
        return;
      }

      // Straight to /portal, which routes to whichever dashboard is theirs —
      // or to the two-factor challenge if they have one, since the recovery
      // session has not satisfied it.
      router.replace("/portal");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (checking) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Checking your link…
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <h1 className="font-display text-xl font-bold">This link has expired</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Reset links last one hour and work once. Links also need to be opened in the same browser
          you requested them from.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Set a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Choose something you have not used on this account before.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Confirm new password</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
