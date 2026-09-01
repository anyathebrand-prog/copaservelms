"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  createChallenge,
  disconnectWallet,
  linkWallet,
  setPrimaryWallet,
  type WalletError,
} from "@/lib/wallet";
import type { WalletProvider } from "@/app/generated/prisma/enums";

/**
 * Wallet actions (PRD §11.5).
 *
 * The address always comes from the browser, but it is only ever trusted once
 * a signature over our own challenge verifies against it.
 */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

const MESSAGES: Record<WalletError, string> = {
  INVALID_ADDRESS: "That does not look like a wallet address for this chain.",
  UNKNOWN_CHAIN: "That network is not one CopaServe supports.",
  CHALLENGE_NOT_FOUND: "That verification request has expired. Please try connecting again.",
  CHALLENGE_EXPIRED: "That verification request has expired. Please try connecting again.",
  CHALLENGE_USED: "That verification request has already been used. Please try connecting again.",
  SIGNATURE_INVALID: "The signature did not match that address, so the wallet was not linked.",
  ALREADY_LINKED: "That wallet is already linked to your account.",
  NOT_FOUND: "That wallet is not on your account.",
};

/** Step one: ask the server for something to sign. */
export async function requestChallengeAction(
  chainKey: string,
  address: string,
): Promise<{ ok: true; nonce: string; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await createChallenge(user.id, chainKey, address);

  if (!result.ok) return { ok: false, error: MESSAGES[result.error] };
  return { ok: true, nonce: result.data.nonce, message: result.data.message };
}

/** Step two: hand back the signature, which the server verifies. */
export async function linkWalletAction(input: {
  nonce: string;
  signature: string;
  provider: WalletProvider;
}): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await linkWallet(user.id, input);

  if (!result.ok) return { ok: false, error: MESSAGES[result.error] };

  revalidatePath("/student/wallet");
  return { ok: true, address: result.data.address };
}

export async function disconnectWalletAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const result = await disconnectWallet(user.id, String(formData.get("walletId") ?? ""));
  if (!result.ok) throw new Error(MESSAGES[result.error]);
  revalidatePath("/student/wallet");
}

export async function setPrimaryWalletAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const result = await setPrimaryWallet(user.id, String(formData.get("walletId") ?? ""));
  if (!result.ok) throw new Error(MESSAGES[result.error]);
  revalidatePath("/student/wallet");
}
