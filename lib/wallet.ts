import { randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { prisma } from "@/lib/prisma";
import { chainName, getChain, type Chain } from "@/lib/chains";
import type { WalletProvider } from "@/app/generated/prisma/enums";

/**
 * Wallet linking (PRD §11.5, §14).
 *
 * Web3 is an additive layer here (§6.2): nothing in learning, certification, or
 * verification requires a wallet, and linking happens after login rather than
 * at signup (§8.2).
 *
 * The rule that shapes this file: an address is only linked once its owner has
 * signed a challenge we issued. Storing an address someone typed proves
 * nothing — anyone can claim any address, and a certificate later minted to an
 * unverified address would be minted to a stranger.
 *
 * Two chain families are supported, and they agree on nothing except that
 * rule. EVM addresses are 20 hex bytes with a checksum in their capitalisation
 * and sign with secp256k1 under EIP-191; Solana addresses are 32-byte ed25519
 * public keys in base58, where capitalisation is the value rather than a
 * checksum. So normalisation and verification both branch on the family, and
 * the chain is bound into the challenge — otherwise a caller could pick which
 * verifier judges their signature.
 */

export type WalletError =
  | "INVALID_ADDRESS"
  | "UNKNOWN_CHAIN"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USED"
  | "SIGNATURE_INVALID"
  | "ALREADY_LINKED"
  | "NOT_FOUND";

export type Result<T> = { ok: true; data: T } | { ok: false; error: WalletError };

/**
 * Canonical form of an address, or null if it is not one for this chain.
 *
 * EVM addresses are checksummed so the same wallet cannot be linked twice
 * under different capitalisation. Solana addresses are left exactly as given:
 * base58 is case-sensitive, so "correcting" the case would name a different
 * account.
 */
export function normalizeAddress(chain: Chain, raw: string): string | null {
  const trimmed = raw.trim();

  if (chain.family === "EVM") {
    return isAddress(trimmed) ? getAddress(trimmed) : null;
  }

  try {
    // A Solana address is a 32-byte public key. Anything that decodes to a
    // different length is not one, however valid the base58.
    return base58.decode(trimmed).length === 32 ? trimmed : null;
  } catch {
    return null;
  }
}

/** Check a signature the way the chain's own wallets produce it. */
export async function verifySignature(
  chain: Chain,
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  if (chain.family === "EVM") {
    return verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);
  }

  try {
    // Solana wallets sign the raw UTF-8 bytes and hand back 64 bytes, which
    // Phantom, Solflare and Backpack all return base58-encoded.
    const signatureBytes = base58.decode(signature.trim());
    if (signatureBytes.length !== 64) return false;

    return ed25519.verify(
      signatureBytes,
      new TextEncoder().encode(message),
      base58.decode(address),
    );
  } catch {
    return false;
  }
}

const CHALLENGE_TTL_MINUTES = 10;

/**
 * Issue a challenge for a specific address.
 *
 * The address is bound at issue time, so a signature collected for one address
 * cannot be used to link a different one. The nonce is single-use.
 */
export async function createChallenge(
  userId: string,
  chainKey: string,
  rawAddress: string,
): Promise<Result<{ nonce: string; message: string }>> {
  const chain = getChain(chainKey);
  if (!chain) return { ok: false, error: "UNKNOWN_CHAIN" };

  const address = normalizeAddress(chain, rawAddress);
  if (!address) return { ok: false, error: "INVALID_ADDRESS" };

  const nonce = randomBytes(16).toString("hex");

  await prisma.walletChallenge.create({
    data: {
      userId,
      nonce,
      address,
      chainKey: chain.key,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
    },
  });

  return { ok: true, data: { nonce, message: buildMessage(chain, address, nonce) } };
}

/**
 * The text the wallet is asked to sign.
 *
 * Written to be readable in a wallet prompt: someone approving this should be
 * able to tell what they are agreeing to, and that it grants no spending
 * rights. The address and nonce are included so a signature cannot be reused
 * for a different address or a second attempt.
 */
export function buildMessage(chain: Chain, address: string, nonce: string): string {
  return [
    "CopaServe wallet verification",
    "",
    "Sign this message to link this wallet to your CopaServe account.",
    "This proves you control the address. It authorises no transaction and",
    "cannot move funds.",
    "",
    `Chain: ${chain.name}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/**
 * Verify a signed challenge and link the wallet.
 *
 * The challenge is consumed whatever the outcome of the signature check, so a
 * failed attempt cannot be retried against the same nonce.
 */
export async function linkWallet(
  userId: string,
  input: { nonce: string; signature: string; provider: WalletProvider },
): Promise<Result<{ walletId: string; address: string; chainKey: string }>> {
  const challenge = await prisma.walletChallenge.findUnique({
    where: { nonce: input.nonce },
    select: { id: true, userId: true, address: true, chainKey: true, expiresAt: true, usedAt: true },
  });

  // Someone else's challenge is treated as no challenge, rather than
  // confirming that the nonce exists.
  if (!challenge || challenge.userId !== userId) return { ok: false, error: "CHALLENGE_NOT_FOUND" };
  if (challenge.usedAt !== null) return { ok: false, error: "CHALLENGE_USED" };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: "CHALLENGE_EXPIRED" };

  // Consumed before verifying: a wrong signature must not leave the nonce
  // available for another attempt.
  await prisma.walletChallenge.update({
    where: { id: challenge.id },
    data: { usedAt: new Date() },
  });

  // The chain was fixed when the challenge was issued, so a caller cannot
  // choose which family judges their signature.
  const chain = getChain(challenge.chainKey);
  if (!chain) return { ok: false, error: "UNKNOWN_CHAIN" };

  const valid = await verifySignature(
    chain,
    challenge.address,
    buildMessage(chain, challenge.address, input.nonce),
    input.signature,
  );

  if (!valid) return { ok: false, error: "SIGNATURE_INVALID" };

  const existing = await prisma.wallet.findFirst({
    where: { userId, address: challenge.address, chainKey: chain.key },
    select: { id: true, disconnectedAt: true },
  });

  if (existing && existing.disconnectedAt === null) {
    return { ok: false, error: "ALREADY_LINKED" };
  }

  const isFirst = (await prisma.wallet.count({ where: { userId, disconnectedAt: null } })) === 0;

  const wallet = existing
    ? await prisma.wallet.update({
        where: { id: existing.id },
        data: { disconnectedAt: null, connectedAt: new Date(), provider: input.provider, isPrimary: isFirst },
        select: { id: true, address: true, chainKey: true },
      })
    : await prisma.wallet.create({
        data: {
          userId,
          address: challenge.address,
          provider: input.provider,
          chainKey: chain.key,
          isPrimary: isFirst,
        },
        select: { id: true, address: true, chainKey: true },
      });

  return {
    ok: true,
    data: { walletId: wallet.id, address: wallet.address, chainKey: wallet.chainKey },
  };
}

export async function disconnectWallet(userId: string, walletId: string): Promise<Result<null>> {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
    select: { id: true, isPrimary: true },
  });
  if (!wallet) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    // Soft disconnect: the link is history once a certificate has been minted
    // to it, and mint transactions reference the wallet.
    await tx.wallet.update({
      where: { id: walletId },
      data: { disconnectedAt: new Date(), isPrimary: false },
    });

    if (wallet.isPrimary) {
      const next = await tx.wallet.findFirst({
        where: { userId, disconnectedAt: null },
        orderBy: { connectedAt: "asc" },
        select: { id: true },
      });
      if (next) await tx.wallet.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  });

  return { ok: true, data: null };
}

export async function setPrimaryWallet(userId: string, walletId: string): Promise<Result<null>> {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId, disconnectedAt: null },
    select: { id: true },
  });
  if (!wallet) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.wallet.updateMany({ where: { userId }, data: { isPrimary: false } }),
    prisma.wallet.update({ where: { id: walletId }, data: { isPrimary: true } }),
  ]);

  return { ok: true, data: null };
}

/** The wallet page's view: linked wallets, mint eligibility, and mint history. */
export async function getWalletOverview(userId: string) {
  const [wallets, certificates, mints] = await Promise.all([
    prisma.wallet.findMany({
      where: { userId, disconnectedAt: null },
      orderBy: [{ isPrimary: "desc" }, { connectedAt: "asc" }],
      select: { id: true, address: true, provider: true, chainKey: true, isPrimary: true, connectedAt: true },
    }),
    prisma.certificate.findMany({
      where: { userId, status: "ISSUED" },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true, certificateNumber: true, mintStatus: true, issuedAt: true,
        enrollment: { select: { course: { select: { title: true } } } },
      },
    }),
    prisma.mintTransaction.findMany({
      where: { certificate: { userId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, transactionHash: true, chainKey: true, createdAt: true,
        certificate: { select: { certificateNumber: true } },
      },
    }),
  ]);

  return {
    wallets: wallets.map((wallet) => ({ ...wallet, chainName: chainName(wallet.chainKey) })),
    certificates,
    mints,
    eligible: certificates.filter((c) => c.mintStatus === "MINT_ELIGIBLE").length,
  };
}
