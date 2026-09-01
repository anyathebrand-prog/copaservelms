import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Two-factor authentication (PRD §8.1, §17 q4 — optional, never enforced).
 *
 * TOTP via Supabase's own MFA, so the secret and its verification live with the
 * auth provider rather than in this database. Nothing here stores a shared
 * secret, which is the point: a leak of our tables should not hand anyone a
 * second factor.
 *
 * The rule that makes this real rather than decorative: a session that has
 * passed a password but not the second factor must not reach anything. Supabase
 * calls that assurance level — `aal1` is password-only, `aal2` is password plus
 * factor. A user who has enrolled a factor has `nextLevel: "aal2"`, and until
 * their session reaches it they are treated as signed out everywhere except the
 * challenge page.
 *
 * Getting that wrong is the whole failure mode. If a half-authenticated session
 * could read a page, an attacker with only the password would simply never
 * complete the second step.
 */

export type MfaStatus = {
  currentLevel: string | null;
  nextLevel: string | null;
  /** Enrolled a factor, but this session has not satisfied it yet. */
  pending: boolean;
  /** Has at least one verified factor, whatever this session's level. */
  enrolled: boolean;
};

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || !data) {
    // Unknown assurance is not an excuse to let someone through, but it is also
    // not a reason to lock out every user if Supabase hiccups. No factor
    // enrolled means nothing to satisfy, so "not pending" is the safe read:
    // the password gate above this is unaffected either way.
    return { currentLevel: null, nextLevel: null, pending: false, enrolled: false };
  }

  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    pending: data.nextLevel === "aal2" && data.currentLevel === "aal1",
    enrolled: data.nextLevel === "aal2",
  };
}

/** Verified factors on the account, for the security settings page. */
export async function listVerifiedFactors() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error || !data) return [];

  return (data.totp ?? [])
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? "Authenticator app",
      createdAt: new Date(factor.created_at),
    }));
}
