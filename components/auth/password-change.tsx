"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password";

/**
 * Change your password, or set one for the first time.
 *
 * Supabase's updateUser({ password }) does not ask for the current password —
 * a live session is enough. On its own that means anyone who finds an unlocked
 * laptop can change the password and lock the owner out of their own account
 * and certificates. So the current password is verified first, by signing in
 * with it, and only then is the new one set. That is the same standard the
 * two-factor panel already holds itself to for removing a factor.
 *
 * Someone who signed up with Google has no password to confirm, so they get a
 * "set a password" form instead. That is worth having rather than hiding: it
 * gives them a second way in if they ever lose the Google account.
 */
export function PasswordChange({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setCurrent("");
    setPassword("");
    setConfirmation("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const problem = validateNewPassword(password, confirmation);
    if (problem) {
      setError(problem);
      setNotice(null);
      return;
    }

    if (hasPassword && password === current) {
      setError("That is your current password.");
      setNotice(null);
      return;
    }

    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (hasPassword) {
        // Proves the person at the keyboard knows the current password. Same
        // user, so the session it returns is the one they already had.
        const { error: wrong } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });

        if (wrong) {
          setError("That is not your current password.");
          return;
        }
      }

      const { error: failure } = await supabase.auth.updateUser({ password });
      if (failure) {
        setError(failure.message);
        return;
      }

      reset();
      setNotice(
        hasPassword
          ? "Password changed. Other devices stay signed in until their sessions expire."
          : "Password set. You can now sign in with your email as well as Google.",
      );
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-pale">
          <KeyRound className="size-4 text-brand" />
        </span>
        <div>
          <h2 className="font-display font-semibold">
            {hasPassword ? "Change password" : "Set a password"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasPassword
              ? "You will need your current password to change it."
              : "You signed in with Google. Adding a password gives you a second way in."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 max-w-sm space-y-4">
        {/* Here for password managers: they need the account this form belongs
            to in order to save the right entry. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

        {hasPassword && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Current password</span>
            <input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
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
        {notice && (
          <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </button>
      </form>
    </section>
  );
}
