import { NextResponse } from "next/server";
import { finalisePayment } from "@/lib/payments";

/**
 * GET /payments/callback — where the provider returns the payer.
 *
 * This is a convenience, not an authority: anyone can open this URL with any
 * reference. It calls the same finalisePayment as the webhook, which
 * re-verifies with the provider, so a forged visit grants nothing. The webhook
 * remains the path that matters if the payer closes the tab.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // Paystack returns `reference`; Flutterwave returns `tx_ref`.
  const reference = searchParams.get("reference") ?? searchParams.get("tx_ref");

  if (!reference) {
    return NextResponse.redirect(`${origin}/student/payments?status=missing`);
  }

  const outcome = await finalisePayment(reference);

  const status =
    outcome === "ENROLLED" || outcome === "ALREADY_FINALISED"
      ? "success"
      : outcome === "FAILED"
        ? "failed"
        : "pending";

  return NextResponse.redirect(`${origin}/student/payments?status=${status}`);
}
