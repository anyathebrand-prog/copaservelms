import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCredential } from "@/lib/certificates";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/verify/:credentialId — public certificate verification (PRD §11.3).
 *
 * Unauthenticated by design: this is what the QR code on every certificate
 * points at. It is also the reason `certificates` carries no anon RLS policy —
 * all public access is funnelled through this single-credential lookup.
 */

// Revocation must be visible immediately (PRD §11.4), so nothing here is cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const { credentialId } = await params;

  const limit = rateLimit(`verify:${clientIp(request)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many verification requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await verifyCredential(prisma, credentialId);

  if (!result.found) {
    // Deliberately identical for a malformed id and a well-formed id that does
    // not exist: distinguishing them would confirm which ids are real.
    return NextResponse.json(
      { found: false, valid: false, message: "No certificate matches this credential ID." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
