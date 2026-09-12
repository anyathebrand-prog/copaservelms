import { base58 } from "@scure/base";
import { CHAINS, caipNamespace, type Chain } from "@/lib/chains";

/**
 * Connecting a wallet that is not in this browser.
 *
 * The existing path only ever talks to an injected provider — window.ethereum
 * or window.solana — which exists when a desktop extension is installed and
 * does not exist on a phone. So on mobile the only way to link a wallet was to
 * open the site inside the wallet app's own browser, which is a thing almost
 * nobody knows to do and a poor place to be reading a course.
 *
 * WalletConnect removes that: on a phone it opens the wallet app directly and
 * returns, and on a desktop it shows a QR code to scan. The wallet stays where
 * it is; only a signature travels.
 *
 * The universal connector rather than a chain adapter, because this platform
 * spans two families. One session covers eip155 and solana together, and no
 * second signing library is pulled in for either.
 *
 * Everything here is browser-only and imported on demand: the connector brings
 * a modal and a relay client with it, and none of that belongs in the bundle
 * of a page that is not linking a wallet.
 */

/**
 * Configured through NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
 *
 * Absent, the option reports itself as unavailable and the injected path is
 * unaffected — the same shape as the email, SMS and payment drivers. The id is
 * free from dashboard.reown.com, and the connector refuses to initialise
 * without one, so offering a button that cannot work would be worse than
 * offering none.
 */
export function walletConnectProjectId(): string | null {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || null;
}

export function walletConnectConfigured(): boolean {
  return walletConnectProjectId() !== null;
}

type Connector = {
  connect(): Promise<{ session: { namespaces: Record<string, { accounts: string[] }> } }>;
  disconnect(): Promise<void>;
  request(params: { method: string; params: unknown }, chain: string): Promise<unknown>;
};

let connector: Connector | null = null;

/**
 * One connector for the page, created on first use.
 *
 * Re-initialising would orphan the previous relay socket and leave the modal's
 * custom elements registered twice.
 */
async function getConnector(): Promise<Connector> {
  if (connector) return connector;

  const projectId = walletConnectProjectId();
  if (!projectId) throw new Error("WalletConnect is not configured.");

  const { UniversalConnector } = await import("@reown/appkit-universal-connector");

  // Every chain the platform supports, grouped by namespace, so one approval
  // covers whichever the learner picked without a second round trip.
  const byNamespace = new Map<string, Chain[]>();
  for (const chain of CHAINS) {
    const namespace = caipNamespace(chain);
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), chain]);
  }

  const networks = [...byNamespace.entries()].map(([namespace, chains]) => ({
    namespace,
    methods: namespace === "solana" ? ["solana_signMessage"] : ["personal_sign"],
    events: namespace === "solana" ? [] : ["accountsChanged", "chainChanged"],
    chains: chains.map((chain) => ({
      id: chain.caip2.split(":")[1]!,
      chainNamespace: namespace,
      caipNetworkId: chain.caip2,
      name: chain.name,
      nativeCurrency:
        namespace === "solana"
          ? { name: "Solana", symbol: "SOL", decimals: 9 }
          : { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    })),
  }));

  connector = (await UniversalConnector.init({
    projectId,
    metadata: {
      name: "CopaServe",
      description: "Learn. Get Certified. Verify. Mint.",
      // The live origin, because wallets show this to the person approving and
      // a mismatch with the site they are on is exactly what should alarm them.
      url: window.location.origin,
      icons: [`${window.location.origin}/icon.png`],
    },
    networks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the config type is wider than the chain shape above
  } as any)) as unknown as Connector;

  return connector;
}

export type WalletConnectResult = {
  address: string;
  /** Signs the challenge with the connected wallet and returns it encoded as the server expects. */
  sign(message: string): Promise<string>;
};

/**
 * Open WalletConnect and return the account for the chosen chain.
 *
 * The address comes from the session's CAIP-10 accounts rather than from
 * anything the page asked for, so a wallet that approved a different account
 * than expected cannot be misread.
 */
export async function connectWalletConnect(chain: Chain): Promise<WalletConnectResult> {
  const active = await getConnector();
  const { session } = await active.connect();

  const namespace = caipNamespace(chain);
  const accounts = session.namespaces[namespace]?.accounts ?? [];

  // CAIP-10: namespace:reference:address. Prefer the exact chain, but accept
  // the namespace: a wallet may approve Base while the session lists Polygon,
  // and the address is the same key either way.
  const exact = accounts.find((account) => account.startsWith(`${chain.caip2}:`));
  const address = (exact ?? accounts[0])?.split(":")[2];

  if (!address) {
    throw new Error(`Your wallet did not share a ${chain.name} account.`);
  }

  return {
    address,
    async sign(message: string) {
      if (namespace === "solana") {
        // solana_signMessage takes the message base58-encoded, not as UTF-8 —
        // unlike the injected path, which takes raw bytes. The wallet signs
        // the decoded bytes, so the server verifies exactly the same challenge
        // either way; only the transport encoding differs.
        const result = (await active.request(
          {
            method: "solana_signMessage",
            params: { message: base58.encode(new TextEncoder().encode(message)), pubkey: address },
          },
          chain.caip2,
        )) as { signature: string };

        if (!result?.signature) throw new Error("The wallet returned no signature.");
        return result.signature;
      }

      // personal_sign takes the message first, then the address.
      const signature = (await active.request(
        { method: "personal_sign", params: [message, address] },
        chain.caip2,
      )) as string;

      if (!signature) throw new Error("The wallet returned no signature.");
      return signature;
    },
  };
}

/** Drop the session, so a second attempt does not silently reuse the first wallet. */
export async function disconnectWalletConnect(): Promise<void> {
  if (!connector) return;
  await connector.disconnect().catch(() => undefined);
  connector = null;
}
