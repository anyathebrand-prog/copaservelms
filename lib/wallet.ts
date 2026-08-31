import { randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";
import { prisma } from "@/lib/prisma";
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
 */

export type WalletError =
  | "INVALID_ADDRESS"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USED"
  | "SIGNATURE_INVALID"
  | "ALREADY_LINKED"
  | "NOT_FOUND";

export type Result<T> = { ok: true; data: T } | { ok: false; error: WalletError };

/** Chains offered, Avalanche first per §6.1. */
export const CHAINS: { id: number; name: string; explorer: string; testnet: boolean }[] = [
  { id: 43114, name: "Avalanche C-Chain", explorer: "https://snowtrace.io", testnet: false },
  { id: 43113, name: "Avalanche Fuji (testnet)", explorer: "https://testnet.snowtrace.io", testnet: true },
  { id: 137, name: "Polygon", explorer: "https://polygonscan.com", testnet: false },
];

export function chainName(chainId: number): string {
  return CHAINS.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;
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
  rawAddress: string,
): Promise<Result<{ nonce: string; message: string }>> {
  if (!isAddress(rawAddress)) return { ok: false, error: "INVALID_ADDRESS" };

  // Checksum form, so the same wallet is always stored identically.
  const address = getAddress(rawAddress);
  const nonce = randomBytes(16).toString("hex");

  await prisma.walletChallenge.create({
    data: {
      userId,
      nonce,
      address,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
    },
  });

  return { ok: true, data: { nonce, message: buildMessage(address, nonce) } };
}

/**
 * The text the wallet is asked to sign.
 *
 * Written to be readable in a wallet prompt: someone approving this should be
 * able to tell what they are agreeing to, and that it grants no spending
 * rights. The address and nonce are included so a signature cannot be reused
 * for a different address or a second attempt.
 */
export function buildMessage(address: string, nonce: string): string {
  return [
    "CopaServe wallet verification",
    "",
    "Sign this message to link this wallet to your CopaServe account.",
    "This proves you control the address. It authorises no transaction and",
    "cannot move funds.",
    "",
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
  input: { nonce: string; signature: string; provider: WalletProvider; chainId: number },
): Promise<Result<{ walletId: string; address: string }>> {
  const challenge = await prisma.walletChallenge.findUnique({
    where: { nonce: input.nonce },
    select: { id: true, userId: true, address: true, expiresAt: true, usedAt: true },
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

  const valid = await verifyMessage({
    address: challenge.address as `0x${string}`,
    message: buildMessage(challenge.address, input.nonce),
    signature: input.signature as `0x${string}`,
  }).catch(() => false);

  if (!valid) return { ok: false, error: "SIGNATURE_INVALID" };

  const existing = await prisma.wallet.findFirst({
    where: { userId, address: challenge.address, chainId: input.chainId },
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
        select: { id: true, address: true },
      })
    : await prisma.wallet.create({
        data: {
          userId,
          address: challenge.address,
          provider: input.provider,
          chainId: input.chainId,
          isPrimary: isFirst,
        },
        select: { id: true, address: true },
      });

  return { ok: true, data: { walletId: wallet.id, address: wallet.address } };
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
      select: { id: true, address: true, provider: true, chainId: true, isPrimary: true, connectedAt: true },
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
        id: true, status: true, transactionHash: true, chainId: true, createdAt: true,
        certificate: { select: { certificateNumber: true } },
      },
    }),
  ]);

  return {
    wallets: wallets.map((wallet) => ({ ...wallet, chainName: chainName(wallet.chainId) })),
    certificates,
    mints,
    eligible: certificates.filter((c) => c.mintStatus === "MINT_ELIGIBLE").length,
  };
}
