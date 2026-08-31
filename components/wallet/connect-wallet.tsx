"use client";

import { useState } from "react";
import { linkWalletAction, requestChallengeAction } from "@/app/(portal)/student/wallet/actions";
import type { WalletProvider } from "@/app/generated/prisma/enums";

/**
 * Connect a browser wallet and prove ownership.
 *
 * Talks to whatever EIP-1193 provider the browser injects, which covers
 * MetaMask, Coinbase Wallet, Rainbow, and Avalanche Core as extensions.
 * WalletConnect is deliberately absent rather than stubbed: it needs its own
 * SDK and a project id, and an option that fails on click is worse than one
 * that is honestly missing.
 *
 * The flow is: ask the wallet who it is, ask our server for a challenge, have
 * the wallet sign it, and let the server verify. The browser never asserts an
 * address on its own authority.
 */
type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRainbow?: boolean;
  isAvalanche?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

/** Name the wallet from what it advertises, so the record is not just "unknown". */
function detectProvider(provider: Eip1193): WalletProvider {
  if (provider.isAvalanche) return "AVALANCHE_CORE";
  if (provider.isCoinbaseWallet) return "COINBASE";
  if (provider.isRainbow) return "RAINBOW";
  if (provider.isMetaMask) return "METAMASK";
  return "WALLETCONNECT";
}

export function ConnectWallet() {
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setNotice(null);

    const injected = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!injected) {
      setError(
        "No browser wallet found. Install MetaMask, Coinbase Wallet, Rainbow, or Avalanche Core, then try again.",
      );
      return;
    }

    setStatus("working");

    try {
      const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) {
        setError("No account was shared by the wallet.");
        return;
      }

      const chainIdHex = (await injected.request({ method: "eth_chainId" })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);

      const challenge = await requestChallengeAction(address);
      if (!challenge.ok) {
        setError(challenge.error);
        return;
      }

      // personal_sign takes the message first, then the address.
      const signature = (await injected.request({
        method: "personal_sign",
        params: [challenge.message, address],
      })) as string;

      const linked = await linkWalletAction({
        nonce: challenge.nonce,
        signature,
        provider: detectProvider(injected),
        chainId,
      });

      if (!linked.ok) {
        setError(linked.error);
        return;
      }

      setNotice(`Linked ${linked.address.slice(0, 6)}…${linked.address.slice(-4)}.`);
    } catch (cause) {
      // Declining the signature prompt is a normal thing to do, not a fault.
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(
        /user rejected|denied/i.test(message)
          ? "You declined the request, so nothing was linked."
          : "The wallet could not complete that request.",
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={connect}
        disabled={status === "working"}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "working" ? "Check your wallet…" : "Connect a wallet"}
      </button>

      {error && <p className="mt-3 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      {notice && (
        <p className="mt-3 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        You will be asked to sign a message proving you control the address. It authorises no
        transaction and cannot move funds.
      </p>
    </div>
  );
}
