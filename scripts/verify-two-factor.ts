/**
 * Functional checks for two-factor authentication (PRD §8.1, §17 q4).
 *
 * Genuinely end to end: this signs a real account in, enrols a TOTP factor
 * against Supabase, computes codes from the returned secret with its own
 * RFC 6238 implementation, and checks what the session's assurance level
 * actually becomes. Nothing is stubbed, because the thing worth testing is
 * precisely whether Supabase agrees that the factor was satisfied.
 *
 * The property that matters is that a password alone stops being enough the
 * moment a factor is enrolled. If a session that has only passed a password
 * still reports aal2, or a wrong code still verifies, then two-factor is
 * decoration and the account is exactly as exposed as before.
 *
 *   npx tsx --env-file=.env scripts/verify-two-factor.ts
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const results: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = process.env.DEMO_PASSWORD ?? "CopaServe-Demo-2026!";

/** RFC 4648 base32, which is how TOTP secrets are exchanged. */
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/**
 * RFC 6238 TOTP, SHA-1, 6 digits, 30-second step.
 *
 * Written out rather than pulled from a package: it is fifteen lines, and a
 * test that generates its own codes proves the whole scheme end to end instead
 * of proving that two libraries agree with each other.
 */
function totp(secret: string, atSeconds = Math.floor(Date.now() / 1000), step = 30): string {
  const counter = Math.floor(atSeconds / step);

  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

async function main() {
  // --- the algorithm, against RFC 6238's own vectors -------------------------
  // The RFC's key is the ASCII "12345678901234567890"; in base32 that is
  // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
  const RFC_KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  check("TOTP matches RFC 6238 at t=59", totp(RFC_KEY, 59) === "287082", totp(RFC_KEY, 59));
  check("TOTP matches RFC 6238 at t=1111111109",
    totp(RFC_KEY, 1111111109) === "081804", totp(RFC_KEY, 1111111109));
  check("TOTP matches RFC 6238 at t=1234567890",
    totp(RFC_KEY, 1234567890) === "005924", totp(RFC_KEY, 1234567890));

  if (!SUPABASE_URL || !ANON || !SERVICE) {
    check("Supabase is configured", false, "missing env; the live half was skipped");
    return finish();
  }

  // --- a throwaway account ---------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `mfa-${Date.now()}@demo.copaserve.test`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createError || !created.user) {
    check("a test account is created", false, createError?.message ?? "no user");
    return finish();
  }

  const userId = created.user.id;

  try {
    const supabase = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
    check("the account signs in with a password", !signInError, signInError?.message ?? "signed in");
    if (signInError) return finish();

    // --- before enrolment ----------------------------------------------------
    const before = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    check("a password-only session is aal1 with nothing outstanding",
      before.data?.currentLevel === "aal1" && before.data?.nextLevel === "aal1",
      `${before.data?.currentLevel} -> ${before.data?.nextLevel}`);

    // --- enrol ---------------------------------------------------------------
    const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Verification run",
    });
    check("a TOTP factor can be enrolled", !enrolError && Boolean(enrolled),
      enrolError?.message ?? "enrolled");
    if (!enrolled) return finish();

    check("enrolment returns a secret and a QR code",
      Boolean(enrolled.totp.secret) && enrolled.totp.qr_code.startsWith("data:"),
      "both present");

    const unverified = await supabase.auth.mfa.listFactors();
    check("a factor is unverified until a code proves it",
      (unverified.data?.totp ?? []).every((f) => f.status !== "verified"),
      "unverified");

    // --- a wrong code ---------------------------------------------------------
    const wrong = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      // A code from a different secret: correctly formed, and not ours.
      code: totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
    });
    check("a code from the wrong secret is refused", Boolean(wrong.error),
      wrong.error ? "refused" : "accepted!");

    // --- the real code --------------------------------------------------------
    const verified = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      code: totp(enrolled.totp.secret),
    });
    check("a code computed from the enrolled secret verifies", !verified.error,
      verified.error?.message ?? "verified");

    const after = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    check("the session reaches aal2 once the factor is satisfied",
      after.data?.currentLevel === "aal2",
      `${after.data?.currentLevel} -> ${after.data?.nextLevel}`);

    const listed = await supabase.auth.mfa.listFactors();
    check("the factor is now verified",
      (listed.data?.totp ?? []).some((f) => f.status === "verified"), "verified");

    // --- the property that matters: a fresh password login is not enough -------
    const second = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await second.auth.signInWithPassword({ email, password: PASSWORD });

    const fresh = await second.auth.mfa.getAuthenticatorAssuranceLevel();
    check("a password alone no longer authenticates once a factor exists",
      fresh.data?.currentLevel === "aal1" && fresh.data?.nextLevel === "aal2",
      `${fresh.data?.currentLevel} -> ${fresh.data?.nextLevel}`);
    check("that is exactly the state the app treats as signed out",
      fresh.data?.nextLevel === "aal2" && fresh.data?.currentLevel === "aal1",
      "pending");

    // --- turning it off --------------------------------------------------------
    const removed = await supabase.auth.mfa.unenroll({ factorId: enrolled.id });
    check("a factor can be removed", !removed.error, removed.error?.message ?? "removed");

    // Asked of a *new* session on purpose. The session that did the removing
    // still carries an aal2 claim in its existing token, so questioning it
    // would report on a token issued before the change rather than on the
    // account as it now stands.
    const third = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await third.auth.signInWithPassword({ email, password: PASSWORD });

    const afterRemoval = await third.auth.mfa.getAuthenticatorAssuranceLevel();
    check("signing in after removal no longer demands a code",
      afterRemoval.data?.currentLevel === "aal1" && afterRemoval.data?.nextLevel === "aal1",
      `${afterRemoval.data?.currentLevel} -> ${afterRemoval.data?.nextLevel}`);

    return finish();
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.log("cleaned up the test account");
  }
}

function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
