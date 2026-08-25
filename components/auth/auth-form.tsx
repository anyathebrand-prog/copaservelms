"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sign-in / sign-up form covering the methods in PRD §8.1.
 *
 * Wallet linking is deliberately absent: it happens after login, from the
 * wallet page, and is never a signup requirement (§8.2, §6.2).
 */
type Mode = "login" | "signup";

type Provider = "google" | "azure";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "google", label: "Google" },
  // Supabase names the Microsoft provider "azure".
  { id: "azure", label: "Microsoft" },
];

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/student";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "We could not complete that sign-in. Please try again." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  // Only relative paths survive, or a crafted ?next= becomes an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/student";
  const callbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

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
  }

  async function handleMagicLink() {
    if (!email) return setError("Enter your email address first.");
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    setPending(false);
    if (error) return setError(error.message);
    setNotice("Magic link sent. Check your inbox.");
  }

  async function handleOAuth(provider: Provider) {
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      setPending(false);
      setError(error.message);
    }
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

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => handleOAuth(provider.id)}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-60"
          >
            {provider.label}
          </button>
        ))}
      </div>

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
