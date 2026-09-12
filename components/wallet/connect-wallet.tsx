"use client";

import { useState } from "react";
import { base58 } from "@scure/base";
import { linkWalletAction, requestChallengeAction } from "@/app/(portal)/student/wallet/actions";
import { selectableChains, type Chain } from "@/lib/chains";
import type { WalletProvider } from "@/app/generated/prisma/enums";
import { QrCode } from "lucide-react";
import {
  connectWalletConnect,
  disconnectWalletConnect,
  walletConnectConfigured,
} from "@/lib/walletconnect";

/**
 * Connect a browser wallet and prove ownership.
 *
 * Two families, two protocols. EVM wallets are reached through whatever
 * EIP-1193 provider the browser injects — MetaMask, Coinbase Wallet, Rainbow —
 * and sign with `personal_sign`. Solana wallets expose their own object and
 * sign raw UTF-8 bytes, returning the signature as bytes rather than hex.
 *
 * Neither of those exists on a phone. A mobile browser injects no provider, so
 * the only way to link a wallet was to open the site inside the wallet app's
 * own browser — which is why a real attempt on Android failed here with
 * nothing useful to say. WalletConnect is the third path and the only one that
 * works everywhere: it opens the wallet app on a phone and shows a QR code on
 * a desktop. It is offered only when a project id is configured, because an
 * option that fails on click is worse than one that is honestly missing.
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
    // window.ethereum is deliberately absent here. WalletConnect's packages
    // declare it globally as Record<string, unknown>, and two declarations of
    // the same property have to agree or neither compiles — so the narrower
    // shape is applied at the point of use instead.
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
  }
}

/** The injected EVM provider, narrowed from the global Record declaration. */
function injectedEvm(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = window.ethereum as unknown;
  return candidate && typeof (candidate as Eip1193).request === "function"
    ? (candidate as Eip1193)
    : undefined;
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
  const [status, setStatus] = useState<"idle" | "injected" | "walletconnect">("idle");

  // Read once: a missing project id means the connector cannot initialise, so
  // the button is not offered rather than offered and broken.
  const walletConnect = walletConnectConfigured();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const chain = chains.find((c) => c.key === chainKey) ?? chains[0];

  async function connect(via: "injected" | "walletconnect") {
    setError(null);
    setNotice(null);
    setStatus(via);

    try {
      const result =
        via === "walletconnect"
          ? await connectViaWalletConnect(chain)
          : chain.family === "EVM"
            ? await connectEvm(chain)
            : await connectSolana(chain);

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

      // A half-finished session would be silently reused by the next attempt,
      // so the second try would fail the same way with no way to recover.
      if (via === "walletconnect") await disconnectWalletConnect();
    } finally {
      setStatus("idle");
    }
  }

  async function startOver() {
    await disconnectWalletConnect();
    setError(null);
    setNotice(null);
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

        {/* WalletConnect first, because it is the one that works everywhere.
            The extension path only exists on a desktop with an extension
            installed, and offering it first on a phone sends people to a
            button that cannot succeed. */}
        {walletConnect && (
          <button
            type="button"
            onClick={() => connect("walletconnect")}
            disabled={status !== "idle"}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <QrCode className="size-4" />
            {status === "walletconnect" ? "Waiting for wallet…" : "Connect wallet"}
          </button>
        )}

        <button
          type="button"
          onClick={() => connect("injected")}
          disabled={status !== "idle"}
          className={
            walletConnect
              ? "rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-60"
              : "rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          }
        >
          {status === "injected"
            ? "Waiting for wallet…"
            : walletConnect
              ? "Use browser extension"
              : "Connect wallet"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {walletConnect
          ? "Scan with any wallet app, or tap to open one on this phone. No extension needed."
          : chain.family === "EVM"
            ? "Works with MetaMask, Coinbase Wallet and Rainbow."
            : "Works with Phantom, Solflare and Backpack."}
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <p>{error}</p>
          {walletConnect && (
            <button
              type="button"
              onClick={startOver}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Forget the wallet and start again
            </button>
          )}
        </div>
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

/**
 * The same handshake as the injected paths, over a WalletConnect session.
 *
 * Deliberately shares requestChallengeAction and the server-side verification:
 * the transport changed, the proof did not. The server still issues a nonce
 * bound to the chain and still checks the signature against the address.
 */
async function connectViaWalletConnect(chain: Chain): Promise<Signed | { error: string }> {
  const wallet = await connectWalletConnect(chain);

  const challenge = await requestChallengeAction(chain.key, wallet.address);
  if (!challenge.ok) return { error: challenge.error };

  const signature = await wallet.sign(challenge.message);

  // WALLETCONNECT rather than a guess at which app answered: the session does
  // not reliably name it, and recording the wrong wallet is worse than
  // recording the transport that was actually used.
  return { nonce: challenge.nonce, signature, provider: "WALLETCONNECT" };
}

async function connectEvm(chain: Chain): Promise<Signed | { error: string }> {
  const injected = injectedEvm();
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
