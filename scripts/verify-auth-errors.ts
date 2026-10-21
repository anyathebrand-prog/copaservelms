/**
 * The words a failed sign-in or signup actually puts on screen.
 *
 * This exists because of a real outage: Supabase's built-in mail service
 * allows about two emails an hour, and once spent it refuses the signup
 * itself with 429 "email rate limit exceeded". Eight attempts were logged in
 * one evening; four were turned away. Every one of those people read a
 * sentence about a rate limit, which tells them nothing about what to do.
 *
 * So the property worth holding is narrow: a person never sees Supabase's
 * developer wording for a failure they could act on, and they do still see it
 * for anything unrecognised, because an odd specific message is more use in a
 * support conversation than a vague one.
 *
 *   npx tsx scripts/verify-auth-errors.ts
 */
import { authErrorMessage } from "../lib/auth-errors";

const results: string[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));

/** Jargon that should never reach a learner. */
const JARGON = /rate limit exceeded|invalid credentials|not authorized|provider|otp|aal|jwt/i;

// --- the failure that caused the outage -------------------------------------
const outage = authErrorMessage({
  code: "over_email_send_rate_limit",
  message: "email rate limit exceeded",
});
check("the signup rate limit is explained, not quoted", !JARGON.test(outage), outage);
check("  and it says to wait rather than retry now", /little while|try again/i.test(outage));
check("  and points at the other sign-in options", /other sign-in options/i.test(outage));

// --- the other failures a person can act on ----------------------------------
for (const [code, must] of [
  ["email_address_not_authorized", /cannot send email|other sign-in options/i],
  ["over_request_rate_limit", /wait a few minutes/i],
  ["over_sms_send_rate_limit", /wait a few minutes/i],
  ["invalid_credentials", /do not match|Google/i],
  ["email_not_confirmed", /confirm/i],
  ["email_provider_disabled", /switched off/i],
  ["otp_expired", /expired/i],
] as const) {
  const text = authErrorMessage({ code, message: "raw developer text" });
  check(`${code} is rewritten for a person`, must.test(text) && text !== "raw developer text", text.slice(0, 60));
}

// --- a server that sends no code ----------------------------------------------
const noCode = authErrorMessage({ message: "Email rate limit exceeded" });
check("a rate limit with no code is still caught by its text", !JARGON.test(noCode), noCode);

// --- anything unrecognised is passed through -----------------------------------
const unknown = authErrorMessage({ code: "something_new", message: "Database is on fire" });
check("an unknown failure keeps its own message", unknown === "Database is on fire", unknown);

const noneAtAll = authErrorMessage(null);
check("no error at all still produces a sentence", noneAtAll.length > 0 && !JARGON.test(noneAtAll), noneAtAll);

// --- nothing in the table is empty or left as a placeholder ---------------------
const codes = [
  "over_email_send_rate_limit", "email_address_not_authorized", "over_request_rate_limit",
  "over_sms_send_rate_limit", "invalid_credentials", "email_not_confirmed",
  "email_provider_disabled", "signup_disabled", "otp_expired", "validation_failed",
];
const bad = codes.filter((c) => {
  const t = authErrorMessage({ code: c, message: "x" });
  return t === "x" || t.length < 20 || !/[.!]$/.test(t.trim());
});
check("every translated failure is a finished sentence", bad.length === 0, bad.join(", "));

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
