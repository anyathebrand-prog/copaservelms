import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getMfaStatus } from "@/lib/mfa";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

export const metadata: Metadata = { title: "Two-factor authentication" };
export const dynamic = "force-dynamic";

/**
 * The second step of signing in.
 *
 * Deliberately outside the middleware matcher, so a session that still owes a
 * factor can reach the one page that lets it finish. Anyone who does not owe
 * one is sent away: an idle challenge form invites someone to wonder whether
 * they were meant to have a code.
 */
export default async function TwoFactorPage() {
  const status = await getMfaStatus();
  if (!status.pending) redirect("/portal");

  return (
    <Suspense>
      <TwoFactorChallenge />
    </Suspense>
  );
}
