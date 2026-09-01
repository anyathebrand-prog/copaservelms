import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSmsDriver, smsConfigured } from "@/lib/notifications/providers";
import { normalizePhone } from "@/lib/phone";

/**
 * POST /api/auth/sms-hook
 *
 * Supabase's Send SMS hook. Supabase generates the one-time code and hands it
 * here to deliver, instead of calling Twilio itself — which is how Termii
 * becomes the transport for sign-in codes without Supabase needing to know
 * Termii exists.
 *
 * The signature check is the whole security of this endpoint. It receives a
 * valid login code for an arbitrary phone number on every call, so an unsigned
 * request would let anyone ask us to text a code to a number they control and
 * then read it. The hook secret is what separates Supabase from everyone else.
 *
 * Supabase signs with Standard Webhooks: base64 HMAC-SHA256 over
 * `${id}.${timestamp}.${body}`, with the secret given as `v1,whsec_<base64>`.
 */
export const dynamic = "force-dynamic";

/** Anything older than this is a replay, not a delivery. */
const TOLERANCE_SECONDS = 300;

type HookPayload = {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string };
};

function verify(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  // The dashboard gives the secret as "v1,whsec_...."; the base64 payload is
  // what is actually keyed with.
  const key = Buffer.from(secret.replace(/^v1,\s*/, "").replace(/^whsec_/, ""), "base64");

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header carries a space-separated list of "v1,<signature>" — more than
  // one while a secret is being rotated.
  return signatureHeader.split(" ").some((entry) => {
    const candidate = entry.startsWith("v1,") ? entry.slice(3) : entry;
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) {
    // Refuse rather than deliver unverified. An open endpoint that texts codes
    // on request is worse than one that does not work.
    return NextResponse.json({ error: "SMS hook is not configured." }, { status: 503 });
  }

  // Read as text: the signature covers the exact bytes sent, and re-serialising
  // a parsed object would change them.
  const rawBody = await request.text();

  if (!verify(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody) as HookPayload;
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;

  if (!phone || !otp) {
    return NextResponse.json({ error: "Payload is missing the phone or code." }, { status: 400 });
  }

  // Supabase stores E.164 without the plus. Normalising here means a number
  // that reached Supabase in any form still leaves for Termii in one.
  const normalized = normalizePhone(phone);
  const to = normalized.ok ? normalized.e164 : `+${phone.replace(/^\+/, "")}`;

  if (!smsConfigured()) {
    // The console driver logs instead of sending, which is right for local work
    // and wrong to report as delivered.
    return NextResponse.json({ error: "No SMS provider is configured." }, { status: 503 });
  }

  const result = await getSmsDriver().send({
    to,
    // Deliberately short and free of links. A code sent with a URL is a
    // phishing template, and the message is quoted back to the sender in
    // Termii's logs.
    text: `${otp} is your CopaServe sign-in code. It expires shortly. We will never ask you for it.`,
  });

  if (!result.ok) {
    // A non-2xx tells Supabase the code was not delivered, so it can report a
    // failure rather than leaving someone waiting for a message that is not
    // coming.
    return NextResponse.json({ error: result.error ?? "Delivery failed." }, { status: 502 });
  }

  return NextResponse.json({ delivered: true });
}
