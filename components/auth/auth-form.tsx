"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { browserSupabaseConfigured, createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPhone, normalizePhone, PHONE_MESSAGES } from "@/lib/phone";

/**
 * Sign-in / sign-up form covering the methods in PRD §8.1.
 *
 * Wallet linking is deliberately absent: it happens after login, from the
 * wallet page, and is never a signup requirement (§8.2, §6.2).
 */
type Mode = "login" | "signup";

/**
 * The provider ids we offer. Narrow rather than string, so a typo in the
 * settings response cannot reach signInWithOAuth.
 */
type Provider = "google";

function asProvider(id: string): Provider | null {
  return id === "google" ? id : null;
}

export function AuthForm({
  mode,
  configured,
  // Only the providers Supabase says it will accept. A button for a provider
  // that is switched off cannot fail gracefully: signInWithOAuth navigates the
  // browser away before any handler here could run.
  providers = [],
  phoneEnabled = false,
}: {
  mode: Mode;
  configured: boolean;
  providers?: { id: string; label: string }[];
  phoneEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "/portal" resolves the right dashboard server-side: roles live in the
  // database, so the browser cannot decide this and must not guess.
  const next = searchParams.get("next") ?? "/portal";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "account_unavailable"
      ? "Your sign-in worked, but this account is not active on CopaServe. Contact your administrator."
      : searchParams.get("error")
        ? "We could not complete that sign-in. Please try again."
        : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Phone sign-in is a second credential, not a second account: it signs you
  // into the account that already holds the number. Only offered on login,
  // because signing up still needs an email — certificates are delivered to
  // one, and NDPA rights requests need somewhere to answer.
  const [usePhone, setUsePhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const normalized = normalizePhone(phone);
    if (!normalized.ok) {
      setError(PHONE_MESSAGES[normalized.error]);
      return;
    }

    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: normalized.e164 });
      if (error) {
        setError(error.message);
        return;
      }
      setCodeSent(true);
      setNotice(`We sent a code to ${formatPhone(normalized.e164)}.`);
    } catch (cause) {
      return reportFailure(cause);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);
    if (!normalized.ok) {
      setError(PHONE_MESSAGES[normalized.error]);
      return;
    }

    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        phone: normalized.e164,
        token: code.trim(),
        type: "sms",
      });
      if (error) {
        setPending(false);
        setError(
          /expired|invalid/i.test(error.message)
            ? "That code is wrong or has expired. Ask for a new one."
            : error.message,
        );
        return;
      }
      router.replace(safeNext);
      router.refresh();
    } catch (cause) {
      return reportFailure(cause);
    }
  }

  // Only relative paths survive, or a crafted ?next= becomes an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/portal";
  const callbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  /** Never let a handler throw into the void: a dead button tells the user nothing. */
  function reportFailure(cause: unknown) {
    setPending(false);
    setError(
      cause instanceof Error && cause.message.startsWith("Missing environment variable")
        ? "Sign-in is unavailable: this deployment is missing its Supabase configuration."
        : "Something went wrong. Please try again.",
    );
    console.error(cause);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (cause) {
      return reportFailure(cause);
    }

    try {

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl,
          // Read by the auth.users trigger to populate the Profile row.
          data: { first_name: firstName, last_name: lastName },
        },
      });
      setPending(false);
      if (error) return setError(error.message);
      return setNotice("Check your email to confirm your account, then sign in.");
    }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setPending(false);
      if (error) return setError(error.message);

      router.push(safeNext);
      // Server Components cache the previous (signed-out) render.
      router.refresh();
    } catch (cause) {
      reportFailure(cause);
    }
  }

  async function handleMagicLink() {
    if (!email) return setError("Enter your email address first.");
    setPending(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl },
      });
      setPending(false);
      if (error) return setError(error.message);
      setNotice("Magic link sent. Check your inbox.");
    } catch (cause) {
      reportFailure(cause);
    }
  }

  async function handleOAuth(provider: Provider) {
    setPending(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl },
      });
      if (error) {
        setPending(false);
        setError(error.message);
      }
    } catch (cause) {
      reportFailure(cause);
    }
  }

  if (!configured || !browserSupabaseConfigured()) {
    return (
      <div className="glass-panel rounded-2xl p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Sign-in unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Authentication is not configured for this deployment yet. Set{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to enable it. They must be readable at build time — on Vercel, marking them
          sensitive hides them from the build, so the browser never receives them.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in to continue your learning."
          : "Start learning, get certified, and verify your credentials."}
      </p>

      {/* The phone panel replaces the credential fields rather than sitting
          beside them: two sign-in forms on one screen is a choice nobody wants
          to make while trying to get in. */}
      {usePhone && mode === "login" ? (
        <div className="mt-6">
          {!codeSent ? (
            <form onSubmit={sendCode} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Phone number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="0803 123 4567"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  The number on your CopaServe account. We will text you a code.
                </span>
              </label>

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Sending..." : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Code</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Checking..." : "Sign in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                  setNotice(null);
                }}
                className="w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
              >
                Use a different number
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setUsePhone(false);
              setCodeSent(false);
              setError(null);
              setNotice(null);
            }}
            className="mt-5 w-full text-center text-sm font-medium text-brand hover:underline"
          >
            Sign in with email instead
          </button>
        </div>
      ) : (
      <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" required />
            <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" required />
          </div>
        )}

        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
        />

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
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      {mode === "login" && (
        <button
          type="button"
          onClick={handleMagicLink}
          disabled={pending}
          className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-60"
        >
          Email me a magic link
        </button>
      )}

      {phoneEnabled && mode === "login" && (
        <button
          type="button"
          onClick={() => {
            setUsePhone(true);
            setError(null);
            setNotice(null);
          }}
          className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
        >
          Sign in with my phone number
        </button>
      )}
      </>
      )}

      {/* No enabled providers means no divider either: "or continue with"
          above an empty row reads as a page that failed to load. */}
      {providers.length > 0 && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className={`grid gap-3 ${providers.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => {
                  const id = asProvider(provider.id);
                  if (id) handleOAuth(id);
                }}
                disabled={pending}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-60"
              >
                {provider.label}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New to CopaServe?{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
