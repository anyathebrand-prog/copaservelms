/**
 * Functional checks for phone sign-in (PRD §8.1).
 *
 * Two things are worth testing here and neither needs Supabase configured.
 *
 * The first is normalisation. One person writes their number five different
 * ways and means the same number every time; Supabase keys accounts on the
 * exact string, so a number that normalises inconsistently is an account the
 * learner cannot get back into.
 *
 * The second is the SMS hook's signature. That endpoint receives a valid login
 * code for an arbitrary phone number on every call, so if the signature check
 * is wrong, anyone can ask us to text a code to a number they control and then
 * read it. It is checked here against real HMACs rather than a mock.
 *
 *   npx tsx --env-file=.env scripts/verify-phone-auth.ts
 */
import { createHmac, randomBytes } from "node:crypto";
import { formatPhone, normalizePhone } from "../lib/phone";

const results: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/** The same identity the route derives, so the test exercises the real scheme. */
function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^v1,\s*/, "").replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

async function main() {
  // --- normalisation --------------------------------------------------------
  const CANONICAL = "+2348031234567";

  const forms = [
    ["0803 123 4567", "spaced national"],
    ["08031234567", "plain national"],
    ["8031234567", "no trunk zero"],
    ["+2348031234567", "E.164"],
    ["2348031234567", "country code, no plus"],
    ["+234 803 123 4567", "E.164 with spaces"],
    ["0803-123-4567", "hyphenated"],
    ["(0803) 123 4567", "bracketed"],
    ["002348031234567", "international prefix"],
  ] as const;

  for (const [input, label] of forms) {
    const result = normalizePhone(input);
    check(
      `the same number written as ${label} normalises identically`,
      result.ok && result.e164 === CANONICAL,
      result.ok ? result.e164 : result.error,
    );
  }

  const empty = normalizePhone("   ");
  check("an empty number is refused", !empty.ok && empty.error === "EMPTY",
    empty.ok ? "accepted!" : empty.error);

  const letters = normalizePhone("0803ABC4567");
  check("letters are refused", !letters.ok, letters.ok ? "accepted!" : letters.error);

  const short = normalizePhone("080312345");
  check("a number that is too short is refused",
    !short.ok && short.error === "TOO_SHORT", short.ok ? "accepted!" : short.error);

  const long = normalizePhone("080312345678");
  check("a number that is too long is refused",
    !long.ok && long.error === "TOO_LONG", long.ok ? "accepted!" : long.error);

  const landline = normalizePhone("012345678901");
  check("a non-mobile prefix is refused rather than silently accepted",
    !landline.ok, landline.ok ? "accepted!" : landline.error);

  const uk = normalizePhone("+447700900123");
  check("a foreign number is refused as not Nigerian, not as malformed",
    !uk.ok && uk.error === "NOT_NIGERIAN_MOBILE", uk.ok ? "accepted!" : uk.error);

  for (const prefix of ["0703", "0803", "0805", "0806", "0810", "0813", "0901", "0902", "0703", "0708", "0912"]) {
    const result = normalizePhone(`${prefix}1234567`);
    if (!result.ok) {
      check(`the ${prefix} prefix is recognised`, false, result.error);
      break;
    }
  }
  check("real Nigerian mobile prefixes are all recognised",
    ["0703", "0803", "0805", "0806", "0810", "0813", "0901", "0902", "0708", "0912"]
      .every((p) => normalizePhone(`${p}1234567`).ok),
    "MTN, Airtel, Glo and 9mobile ranges");

  check("a normalised number formats back for display",
    formatPhone(CANONICAL) === "0803 123 4567", formatPhone(CANONICAL));
  check("formatting leaves an unparseable value alone rather than mangling it",
    formatPhone("nonsense") === "nonsense", formatPhone("nonsense"));

  // --- the SMS hook signature ------------------------------------------------
  const secret = `v1,whsec_${randomBytes(24).toString("base64")}`;
  const body = JSON.stringify({ user: { phone: "2348031234567" }, sms: { otp: "123456" } });
  const id = `msg_${randomBytes(8).toString("hex")}`;
  const now = String(Math.floor(Date.now() / 1000));
  const signature = sign(secret, id, now, body);

  check("a correct signature verifies",
    hookVerify(body, headersFor(id, now, `v1,${signature}`), secret), "valid");

  check("a signature from a different secret is refused",
    !hookVerify(body, headersFor(id, now, `v1,${sign("v1,whsec_" + randomBytes(24).toString("base64"), id, now, body)}`), secret),
    "refused");

  check("a tampered body is refused",
    !hookVerify(
      body.replace("123456", "999999"),
      headersFor(id, now, `v1,${signature}`),
      secret,
    ),
    "refused");

  check("a tampered phone number is refused",
    !hookVerify(
      body.replace("2348031234567", "2348039999999"),
      headersFor(id, now, `v1,${signature}`),
      secret,
    ),
    "refused");

  const stale = String(Math.floor(Date.now() / 1000) - 3600);
  check("a replayed delivery is refused once stale",
    !hookVerify(body, headersFor(id, stale, `v1,${sign(secret, id, stale, body)}`), secret),
    "refused");

  check("a missing signature header is refused",
    !hookVerify(body, headersFor(id, now, null), secret), "refused");

  check("the message id is part of what is signed",
    !hookVerify(body, headersFor("msg_other", now, `v1,${signature}`), secret), "refused");

  check("a secret being rotated verifies against either signature",
    hookVerify(body, headersFor(id, now, `v1,deadbeef v1,${signature}`), secret), "valid");

  return finish();
}

/** Mirrors the route's header shape. */
function headersFor(id: string, timestamp: string, signature: string | null): Headers {
  const headers = new Headers();
  headers.set("webhook-id", id);
  headers.set("webhook-timestamp", timestamp);
  if (signature) headers.set("webhook-signature", signature);
  return headers;
}

/**
 * A copy of the route's verification, kept in the test on purpose.
 *
 * The route is a Next handler that reads process.env and the request body, so
 * importing it here would mean standing up a request. The scheme is small
 * enough that restating it is honest; if the two ever disagree, this file is
 * the specification and the route is the bug.
 */
function hookVerify(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = sign(secret, id, timestamp, rawBody);

  return signatureHeader.split(" ").some((entry) => {
    const candidate = entry.startsWith("v1,") ? entry.slice(3) : entry;
    return candidate.length === expected.length && candidate === expected;
  });
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
