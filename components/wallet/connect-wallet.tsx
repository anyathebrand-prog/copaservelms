"use client";

import { useState } from "react";
import { base58 } from "@scure/base";
import { linkWalletAction, requestChallengeAction } from "@/app/(portal)/student/wallet/actions";
import { selectableChains, type Chain } from "@/lib/chains";
import type { WalletProvider } from "@/app/generated/prisma/enums";

/**
 * Connect a browser wallet and prove ownership.
 *
 * Two families, two protocols. EVM wallets are reached through whatever
 * EIP-1193 provider the browser injects — MetaMask, Coinbase Wallet, Rainbow —
 * and sign with `personal_sign`. Solana wallets expose their own object and
 * sign raw UTF-8 bytes, returning the signature as bytes rather than hex.
 *
 * WalletConnect is deliberately absent rather than stubbed: it needs its own
 * SDK and a project id, and an option that fails on click is worse than one
 * that is honestly missing.
 *
 * The flow is the same either way: ask the wallet who it is, ask our server
 * for a challenge, have the wallet sign it, and let the server verify. The
 * browser never asserts an address on its own authority.
 *
 * Note that linking never asks a wallet to switch network. Proving ownership
 * is a signature, not a transaction, and it is valid whatever chain the wallet
 * happens to be pointed at — so the chain recorded is the one chosen here.
 * Minting is where the connected network will actually matter.
 */

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRainbow?: boolean;
};

type SolanaProvider = {
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signMessage: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
  }
}

function detectEvmProvider(provider: Eip1193): WalletProvider {
  if (provider.isCoinbaseWallet) return "COINBASE";
  if (provider.isRainbow) return "RAINBOW";
  if (provider.isMetaMask) return "METAMASK";
  return "WALLETCONNECT";
}

function detectSolanaProvider(): { provider: SolanaProvider; name: WalletProvider } | null {
  if (typeof window === "undefined") return null;
  if (window.solana?.isPhantom) return { provider: window.solana, name: "PHANTOM" };
  if (window.solflare?.isSolflare) return { provider: window.solflare, name: "SOLFLARE" };
  if (window.backpack) return { provider: window.backpack, name: "BACKPACK" };
  if (window.solana) return { provider: window.solana, name: "PHANTOM" };
  return null;
}

export function ConnectWallet() {
  const chains = selectableChains();
  const [chainKey, setChainKey] = useState(chains[0]?.key ?? "base");
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const chain = chains.find((c) => c.key === chainKey) ?? chains[0];

  async function connect() {
    setError(null);
    setNotice(null);
    setStatus("working");

    try {
      const result =
        chain.family === "EVM" ? await connectEvm(chain) : await connectSolana(chain);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      const linked = await linkWalletAction({
        nonce: result.nonce,
        signature: result.signature,
        provider: result.provider,
      });

      if (!linked.ok) {
        setError(linked.error);
        return;
      }

      setNotice(`Linked ${linked.address.slice(0, 10)}…${linked.address.slice(-6)} on ${chain.name}.`);
    } catch (cause) {
      // A rejected signature is the normal way to say no, not a failure.
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(
        /reject|denied|cancel/i.test(message)
          ? "You declined the signature, so nothing was linked."
          : "The wallet could not complete that request.",
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-semibold">Link a wallet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional. Linking proves you control the address so a certificate can later be minted to
        it. It authorises no transaction and cannot move funds.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1">
          <span className="mb-1.5 block text-sm font-medium">Network</span>
          <select
            value={chainKey}
            onChange={(event) => setChainKey(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          >
            {chains.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={connect}
          disabled={status === "working"}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "working" ? "Waiting for wallet…" : "Connect wallet"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {chain.family === "EVM"
          ? "Works with MetaMask, Coinbase Wallet and Rainbow."
          : "Works with Phantom, Solflare and Backpack."}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}
    </div>
  );
}

type Signed = { nonce: string; signature: string; provider: WalletProvider };

async function connectEvm(chain: Chain): Promise<Signed | { error: string }> {
  const injected = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!injected) {
    return { error: "No browser wallet found. Install MetaMask, Coinbase Wallet or Rainbow." };
  }

  const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) return { error: "No account was shared by the wallet." };

  const challenge = await requestChallengeAction(chain.key, address);
  if (!challenge.ok) return { error: challenge.error };

  // personal_sign takes the message first, then the address.
  const signature = (await injected.request({
    method: "personal_sign",
    params: [challenge.message, address],
  })) as string;

  return { nonce: challenge.nonce, signature, provider: detectEvmProvider(injected) };
}

async function connectSolana(chain: Chain): Promise<Signed | { error: string }> {
  const detected = detectSolanaProvider();
  if (!detected) {
    return { error: "No Solana wallet found. Install Phantom, Solflare or Backpack." };
  }

  const { publicKey } = await detected.provider.connect();
  const address = publicKey.toString();

  const challenge = await requestChallengeAction(chain.key, address);
  if (!challenge.ok) return { error: challenge.error };

  const { signature } = await detected.provider.signMessage(
    new TextEncoder().encode(challenge.message),
    "utf8",
  );

  // Solana signatures travel as base58, which is what the server decodes.
  return { nonce: challenge.nonce, signature: base58.encode(signature), provider: detected.name };
}
