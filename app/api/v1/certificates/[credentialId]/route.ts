import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, hasScope } from "@/lib/api-keys";
import { verifyCredential } from "@/lib/certificates";

/**
 * GET /api/v1/certificates/:credentialId
 *
 * Machine verification for employers and integrators (PRD §13.3).
 *
 * The same answer as the public page, but authenticated and rate-limitable.
 * The public endpoint stays open because a QR code must work for anyone; this
 * one exists so a partner can verify in bulk under an identity we can revoke.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }
  if (!hasScope(key, "VERIFY_READ")) {
    return NextResponse.json({ error: "This key cannot read verifications." }, { status: 403 });
  }

  const { credentialId } = await params;
  const result = await verifyCredential(prisma, credentialId);

  return NextResponse.json(result, {
    status: result.found ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
