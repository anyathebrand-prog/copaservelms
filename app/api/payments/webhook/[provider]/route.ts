import { NextResponse } from "next/server";
import { getPaymentDriver } from "@/lib/payments/provider";
import { finalisePayment } from "@/lib/payments";
import type { PaymentProvider } from "@/app/generated/prisma/enums";

/**
 * POST /api/payments/webhook/:provider
 *
 * The authoritative path for granting enrolment. Two rules:
 *
 * 1. The signature is checked against the raw body before anything is parsed.
 *    An unsigned or mis-signed request is an attacker claiming a payment.
 * 2. The body is used only for the reference. The amount and status come from
 *    calling the provider back in finalisePayment — a webhook body is an
 *    assertion, not proof, even when correctly signed.
 */
export const dynamic = "force-dynamic";

const PROVIDERS: Record<string, PaymentProvider> = {
  paystack: "PAYSTACK",
  flutterwave: "FLUTTERWAVE",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: slug } = await params;
  const provider = PROVIDERS[slug.toLowerCase()];

  if (!provider) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  }

  // Read as text, not json: the signature covers the exact bytes sent, and
  // re-serialising a parsed object would change them.
  const rawBody = await request.text();

  let driver;
  try {
    driver = getPaymentDriver(provider);
  } catch {
    return NextResponse.json({ error: "Provider not configured." }, { status: 503 });
  }

  const signature =
    request.headers.get("x-paystack-signature") ?? request.headers.get("verif-hash");

  if (!driver.verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const parsed = driver.parseWebhook(rawBody);
  if (!parsed) {
    // Signed but not a payment event we handle: acknowledge so the provider
    // stops retrying, rather than failing loudly over something irrelevant.
    return NextResponse.json({ received: true, handled: false });
  }

  const outcome = await finalisePayment(parsed.reference);

  // Always 200 for a signed, well-formed webhook. A non-2xx makes the provider
  // retry, which is pointless for a payment that genuinely failed.
  return NextResponse.json({ received: true, outcome });
}
