"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Turn two-factor authentication on, or off.
 *
 * Optional by decision (§17 q4): nothing here nudges, and nothing anywhere
 * refuses a user who has not enrolled. It is offered because an admin who can
 * approve courses, suspend accounts and export personal data is worth more to
 * an attacker than a password alone should protect.
 *
 * Removing a factor requires a current code, not just a session. Otherwise
 * anyone who borrowed an unlocked laptop could strip the protection off in two
 * clicks, which would make enrolling it close to pointless.
 */
type Factor = { id: string; friendlyName: string; createdAt: Date };

type Enrolling = { factorId: string; qr: string; secret: string };

export function TwoFactorSetup({ factors }: { factors: Factor[] }) {
  const router = useRouter();

  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function begin() {
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });

      if (enrolError || !data) {
        setError(enrolError?.message ?? "Could not start setup.");
        return;
      }

      setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } finally {
      setPending(false);
    }
  }

  /** Nothing is protecting anything until a code from the app verifies. */
  async function confirm() {
    if (!enrolling) return;
    setError(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrolling.factorId,
        code: code.trim(),
      });

      if (verifyError) {
        setError("That code was not accepted. Codes change every 30 seconds — try the current one.");
        setCode("");
        return;
      }

      setEnrolling(null);
      setCode("");
      setNotice("Two-factor authentication is on. You will be asked for a code next time you sign in.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    if (!enrolling) return;
    const supabase = createSupabaseBrowserClient();
    // An unverified factor left behind would sit in the account list forever.
    await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {});
    setEnrolling(null);
    setCode("");
    setError(null);
  }

  async function remove(factorId: string) {
    setError(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // Prove it is still you before the protection comes off.
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });

      if (verifyError) {
        setError("That code was not accepted, so two-factor is still on.");
        setCode("");
        return;
      }

      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId });
      if (removeError) {
        setError(removeError.message);
        return;
      }

      setRemoving(null);
      setCode("");
      setNotice("Two-factor authentication is off.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const codeInput = (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={code}
      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
      placeholder="000000"
      className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition focus:border-brand"
    />
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        {factors.length > 0 ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <ShieldOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        )}
        <div>
          <h2 className="font-display text-lg font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {factors.length > 0
              ? "On. You are asked for a code from your authenticator app when you sign in."
              : "Off. Optional, but worth turning on if your account can approve courses or see other people's data."}
          </p>
        </div>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* --- setting up ------------------------------------------------- */}
      {enrolling && (
        <div className="mt-5 rounded-xl border border-border bg-surface-muted p-5">
          <p className="text-sm font-medium">Scan this with your authenticator app</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Google Authenticator, Authy, 1Password — any of them.
          </p>

          <div className="mt-4 flex flex-wrap items-start gap-5">
            <Image
              src={enrolling.qr}
              alt="Two-factor setup QR code"
              width={168}
              height={168}
              unoptimized
              className="rounded-lg border border-border bg-white p-2"
            />

            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Or enter this code by hand:</p>
              <code className="mt-1 block break-all font-mono text-xs">{enrolling.secret}</code>

              <p className="mt-4 text-xs text-muted-foreground">
                Then type the six digits it shows:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {codeInput}
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || code.length < 6}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {pending ? "Checking..." : "Turn on"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- enrolled factors -------------------------------------------- */}
      {factors.length > 0 && !enrolling && (
        <ul className="mt-5 space-y-3">
          {factors.map((factor) => (
            <li key={factor.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{factor.friendlyName}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {factor.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </p>
                </div>

                {removing === factor.id ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoving(factor.id);
                      setCode("");
                      setError(null);
                      setNotice(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
                  >
                    Turn off
                  </button>
                )}
              </div>

              {removing === factor.id && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Enter a current code to confirm it is you.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {codeInput}
                    <button
                      type="button"
                      onClick={() => remove(factor.id)}
                      disabled={pending || code.length < 6}
                      className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                    >
                      {pending ? "Checking..." : "Turn off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(null);
                        setCode("");
                      }}
                      className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                    >
                      Keep it on
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {factors.length === 0 && !enrolling && (
        <button
          type="button"
          onClick={begin}
          disabled={pending}
          className="mt-5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Starting..." : "Turn on two-factor"}
        </button>
      )}
    </div>
  );
}
