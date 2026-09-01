/**
 * Nigerian phone numbers, in one canonical form.
 *
 * The same person writes their number as 0803 123 4567, 08031234567,
 * 8031234567, +2348031234567 and 2348031234567, and means the same number
 * every time. Supabase keys accounts on the exact string, so without
 * normalisation one person can end up with several accounts and none of them
 * able to receive their certificate.
 *
 * Stored in E.164 — a leading +, country code, no spaces — because that is what
 * Supabase Auth and Termii both expect, and because a number stored with the
 * local leading zero cannot be dialled from anywhere else.
 */

/** Nigeria. Deliberately the only default: this is where the learners are. */
const NG_CODE = "234";

/**
 * Nigerian mobile prefixes, after the country code, as of 2026.
 *
 * Checked rather than assumed. A typo that produces a valid-looking but
 * unassigned prefix means an OTP that is never delivered and a learner who
 * cannot sign in, and "the SMS did not arrive" is almost impossible to
 * distinguish from "the number was wrong" after the fact.
 */
const NG_MOBILE_PREFIXES = [
  "70", "71",
  "80", "81", "90", "91",
  "78",
];

export type PhoneError = "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "NOT_NIGERIAN_MOBILE" | "MALFORMED";

export type PhoneResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; error: PhoneError };

/**
 * Normalise a number as typed into E.164.
 *
 * Accepts the forms Nigerians actually write, and rejects rather than guesses
 * when the result would not be a reachable mobile.
 */
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "EMPTY" };

  // Strip everything a person might use to make a number readable.
  let digits = trimmed.replace(/[\s()\-.]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  // 00 is the international prefix used across much of Africa and Europe.
  else if (digits.startsWith("00")) digits = digits.slice(2);

  if (!/^\d+$/.test(digits)) return { ok: false, error: "MALFORMED" };

  // 0803… — the national form, with the trunk zero.
  if (digits.startsWith("0")) digits = NG_CODE + digits.slice(1);
  // 803… — written without either the trunk zero or the country code.
  else if (!digits.startsWith(NG_CODE) && digits.length === 10) digits = NG_CODE + digits;

  if (!digits.startsWith(NG_CODE)) {
    // A foreign number is not rejected as malformed — it is simply not
    // something this platform can verify, and saying so is more useful than
    // pretending the format is wrong.
    return { ok: false, error: "NOT_NIGERIAN_MOBILE" };
  }

  const national = digits.slice(NG_CODE.length);

  if (national.length < 10) return { ok: false, error: "TOO_SHORT" };
  if (national.length > 10) return { ok: false, error: "TOO_LONG" };

  if (!NG_MOBILE_PREFIXES.some((prefix) => national.startsWith(prefix))) {
    return { ok: false, error: "NOT_NIGERIAN_MOBILE" };
  }

  return { ok: true, e164: `+${digits}`, national: `0${national}` };
}

/** Human-readable for display: 0803 123 4567. */
export function formatPhone(e164: string): string {
  const result = normalizePhone(e164);
  if (!result.ok) return e164;

  const n = result.national;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

export const PHONE_MESSAGES: Record<PhoneError, string> = {
  EMPTY: "Enter your phone number.",
  MALFORMED: "That number contains characters we do not recognise.",
  TOO_SHORT: "That number is too short for a Nigerian mobile.",
  TOO_LONG: "That number is too long for a Nigerian mobile.",
  NOT_NIGERIAN_MOBILE: "Enter a Nigerian mobile number, such as 0803 123 4567.",
};
