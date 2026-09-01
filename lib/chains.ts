/**
 * The chains a certificate can be minted to (PRD §11.5, §17 q6).
 *
 * Two families, not one. Avalanche, Base and Polygon are all EVM — swapping
 * between them is a row in this table, because addresses, signatures and
 * explorers all work the same way. Solana is genuinely different: ed25519
 * keys, base58 addresses, no numeric chain id. Pretending otherwise is how a
 * codebase ends up with `chainId: 0` meaning Solana.
 *
 * So a chain is identified by a stable string key, stored on the wallet, and
 * its family decides how an address is validated and a signature checked.
 * Everything chain-shaped lives here; nothing else should hard-code an id.
 */

export type ChainFamily = "EVM" | "SOLANA";

export type Chain = {
  /** Stable identifier, written to the database. Never renumber these. */
  key: string;
  name: string;
  family: ChainFamily;
  /** EVM only. Solana has no numeric chain id, which is why this is optional. */
  chainId?: number;
  /** Solana only. */
  cluster?: string;
  testnet: boolean;
  explorerAddress: (address: string) => string;
  explorerTx: (hash: string) => string;
};

export const CHAINS: Chain[] = [
  {
    key: "base",
    name: "Base",
    family: "EVM",
    chainId: 8453,
    testnet: false,
    explorerAddress: (a) => `https://basescan.org/address/${a}`,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
  },
  {
    key: "base-sepolia",
    name: "Base Sepolia (testnet)",
    family: "EVM",
    chainId: 84532,
    testnet: true,
    explorerAddress: (a) => `https://sepolia.basescan.org/address/${a}`,
    explorerTx: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  {
    key: "polygon",
    name: "Polygon",
    family: "EVM",
    chainId: 137,
    testnet: false,
    explorerAddress: (a) => `https://polygonscan.com/address/${a}`,
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
  },
  {
    key: "polygon-amoy",
    name: "Polygon Amoy (testnet)",
    family: "EVM",
    chainId: 80002,
    testnet: true,
    explorerAddress: (a) => `https://amoy.polygonscan.com/address/${a}`,
    explorerTx: (h) => `https://amoy.polygonscan.com/tx/${h}`,
  },
  {
    key: "solana",
    name: "Solana",
    family: "SOLANA",
    cluster: "mainnet-beta",
    testnet: false,
    explorerAddress: (a) => `https://explorer.solana.com/address/${a}`,
    explorerTx: (h) => `https://explorer.solana.com/tx/${h}`,
  },
  {
    key: "solana-devnet",
    name: "Solana Devnet",
    family: "SOLANA",
    cluster: "devnet",
    testnet: true,
    explorerAddress: (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
    explorerTx: (h) => `https://explorer.solana.com/tx/${h}?cluster=devnet`,
  },
];

export function getChain(key: string): Chain | null {
  return CHAINS.find((chain) => chain.key === key) ?? null;
}

/** Look an EVM chain up by the id a browser wallet reports. */
export function chainByEvmId(chainId: number): Chain | null {
  return CHAINS.find((chain) => chain.family === "EVM" && chain.chainId === chainId) ?? null;
}

export function chainName(key: string): string {
  return getChain(key)?.name ?? key;
}

/** The chains offered in the interface, mainnets first. */
export function selectableChains(): Chain[] {
  return [...CHAINS].sort((a, b) => Number(a.testnet) - Number(b.testnet));
}
