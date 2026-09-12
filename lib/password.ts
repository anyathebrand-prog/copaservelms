/**
 * Password rules, in one place.
 *
 * The signup form already required eight characters; stating it once means a
 * reset cannot quietly accept something the signup form would have refused.
 * Supabase enforces its own minimum server-side, so this is the friendly
 * message rather than the actual gate.
 *
 * Deliberately free of server imports. This module is pulled into client
 * components, and a single `next/headers` dependency anywhere in it fails the
 * build for all of them — which is exactly what happened when the identity
 * lookup lived here. That one is in lib/auth.ts, with the rest of the
 * server-side session code.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Returns a problem to show the person, or null when the password is fine. */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password !== password.trim()) {
    return "Passwords cannot start or end with a space.";
  }
  if (password !== confirmation) {
    return "The two passwords do not match.";
  }
  return null;
}
