"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Ask for a reset link.
 *
 * The confirmation is identical whether or not the address has an account.
 * Anything else turns this form into a membership oracle: type an address,
 * read the response, learn whether that person is a CopaServe user. For a
 * platform whose learners are named compliance officers at named banks, that
 * list has real value to someone phishing them.
 *
 * The link lands on /auth/callback, which exchanges the one-time code for a
 * session and forwards to /reset-password. Reusing the existing callback means
 * there is one place where a code becomes a session.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;

      const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      // Rate limiting is the one failure worth showing, because retrying is
      // the wrong move and the person needs to know to wait. Everything else
      // is reported as success: a failure that distinguishes a real address
      // from a fake one is the leak this form exists to avoid.
      if (failure && /rate|too many/i.test(failure.message)) {
        setError("Too many attempts. Wait a few minutes and try again.");
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-pale">
          <MailCheck className="size-6 text-brand" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>,
          a link to set a new password is on its way. It expires in one hour.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Nothing arrived? Check spam, then{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-brand hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Enter the email you signed up with and we will send you a link to set a new one.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            autoFocus
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
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
