/**
 * Functional checks for wallet linking (PRD §11.5, §8.2, §17 q6).
 *
 * The property under test is ownership. An address typed into a form proves
 * nothing, so linking requires signing a challenge we issued — and a
 * certificate minted later to an unverified address would be minted to a
 * stranger.
 *
 * Both chain families are exercised with real keys: secp256k1 through viem for
 * EVM, ed25519 through @noble/curves for Solana. Nothing here is stubbed, so
 * the signature path that runs in production is the one under test.
 *
 * The cross-family cases matter most. Two address formats and two signature
 * schemes are exactly the conditions under which a verifier gets applied to
 * the wrong input, so an EVM address is offered to Solana and a Solana
 * signature to EVM, and both must be refused.
 *
 *   npx tsx --env-file=.env scripts/verify-wallet.ts
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  buildMessage,
  createChallenge,
  disconnectWallet,
  getWalletOverview,
  linkWallet,
  normalizeAddress,
  setPrimaryWallet,
  verifySignature,
} from "../lib/wallet";
import { chainName, getChain } from "../lib/chains";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.walletChallenge.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

const BASE = "base";
const POLYGON = "polygon";
const SOLANA = "solana";

/** A Solana identity: an ed25519 key, with base58 addresses and signatures. */
function solanaKeypair() {
  const secret = ed25519.utils.randomSecretKey();
  const address = base58.encode(ed25519.getPublicKey(secret));
  return {
    address,
    sign: (message: string) =>
      base58.encode(ed25519.sign(new TextEncoder().encode(message), secret)),
  };
}

async function main() {
  const owner = await prisma.user.create({
    data: { email: `wal-owner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Wallet", lastName: "Owner" } } },
  });
  createdUsers.push(owner.id);

  const other = await prisma.user.create({
    data: { email: `wal-other-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Other", lastName: "Person" } } },
  });
  createdUsers.push(other.id);

  const account = privateKeyToAccount(generatePrivateKey());
  const attacker = privateKeyToAccount(generatePrivateKey());
  const solana = solanaKeypair();
  const solanaAttacker = solanaKeypair();

  // --- the chain registry -------------------------------------------------
  check("Base is offered", chainName(BASE) === "Base", chainName(BASE));
  check("Polygon is offered", chainName(POLYGON) === "Polygon", chainName(POLYGON));
  check("Solana is offered", chainName(SOLANA) === "Solana", chainName(SOLANA));
  check("Avalanche is gone", getChain("avalanche") === null, "not in the registry");
  check("an unknown chain is refused rather than guessed",
    getChain("dogecoin") === null, "null");
  check("EVM chains carry a numeric id", getChain(BASE)?.chainId === 8453, `${getChain(BASE)?.chainId}`);
  check("Solana carries a cluster, not a chain id",
    getChain(SOLANA)?.chainId === undefined && getChain(SOLANA)?.cluster === "mainnet-beta",
    getChain(SOLANA)?.cluster ?? "");

  const unknown = await createChallenge(owner.id, "dogecoin", account.address);
  check("a challenge on an unsupported chain is refused",
    !unknown.ok && unknown.error === "UNKNOWN_CHAIN", unknown.ok ? "issued!" : unknown.error);

  // --- address validation is per family ------------------------------------
  const bad = await createChallenge(owner.id, BASE, "not-an-address");
  check("a malformed address is refused", !bad.ok && bad.error === "INVALID_ADDRESS",
    bad.ok ? "accepted!" : bad.error);

  const evmOnSolana = await createChallenge(owner.id, SOLANA, account.address);
  check("an EVM address is not a Solana address",
    !evmOnSolana.ok && evmOnSolana.error === "INVALID_ADDRESS",
    evmOnSolana.ok ? "accepted!" : evmOnSolana.error);

  const solanaOnEvm = await createChallenge(owner.id, BASE, solana.address);
  check("a Solana address is not an EVM address",
    !solanaOnEvm.ok && solanaOnEvm.error === "INVALID_ADDRESS",
    solanaOnEvm.ok ? "accepted!" : solanaOnEvm.error);

  const evmChain = getChain(BASE)!;
  const solChain = getChain(SOLANA)!;
  check("an EVM address is stored checksummed",
    normalizeAddress(evmChain, account.address.toLowerCase()) === account.address,
    "checksummed");
  check("a Solana address is stored exactly as given, since base58 is case-sensitive",
    normalizeAddress(solChain, solana.address) === solana.address, "unchanged");
  check("a base58 string of the wrong length is not a Solana address",
    normalizeAddress(solChain, base58.encode(new Uint8Array(16))) === null, "refused");

  // --- EVM: the happy path -------------------------------------------------
  const challenge = await createChallenge(owner.id, BASE, account.address);
  check("a challenge is issued", challenge.ok, challenge.ok ? "issued" : challenge.error);
  if (!challenge.ok) return finish();

  check("the message names the address and nonce",
    challenge.data.message.includes(account.address) && challenge.data.message.includes(challenge.data.nonce),
    "both present");
  check("the message names the chain being linked",
    challenge.data.message.includes("Base"), "named");
  check("the message says it authorises no transaction",
    /cannot move funds/i.test(challenge.data.message), "stated");

  // Verification rebuilds the message from stored values rather than trusting
  // what the client sends, so the two must be identical or nothing verifies.
  check("the issued message matches what verification rebuilds",
    challenge.data.message === buildMessage(evmChain, account.address, challenge.data.nonce),
    "identical");

  const signature = await account.signMessage({ message: challenge.data.message });
  const linked = await linkWallet(owner.id, {
    nonce: challenge.data.nonce, signature, provider: "METAMASK",
  });
  check("a correctly signed EVM challenge links the wallet", linked.ok,
    linked.ok ? linked.data.address : linked.error);
  check("the wallet records the chain it was linked on",
    linked.ok && linked.data.chainKey === BASE, linked.ok ? linked.data.chainKey : "");

  const first = await prisma.wallet.findFirstOrThrow({ where: { userId: owner.id } });
  check("the first wallet becomes primary", first.isPrimary === true, `${first.isPrimary}`);

  // --- Solana: the happy path ---------------------------------------------
  const solChallenge = await createChallenge(owner.id, SOLANA, solana.address);
  check("a Solana challenge is issued", solChallenge.ok,
    solChallenge.ok ? "issued" : solChallenge.error);
  if (!solChallenge.ok) return finish();

  const solLinked = await linkWallet(owner.id, {
    nonce: solChallenge.data.nonce,
    signature: solana.sign(solChallenge.data.message),
    provider: "PHANTOM",
  });
  check("a correctly signed Solana challenge links the wallet", solLinked.ok,
    solLinked.ok ? solLinked.data.address : solLinked.error);
  check("the Solana wallet records its chain",
    solLinked.ok && solLinked.data.chainKey === SOLANA, solLinked.ok ? solLinked.data.chainKey : "");

  const solWrongKey = await createChallenge(owner.id, SOLANA, solana.address);
  if (!solWrongKey.ok) return finish();
  const solForged = await linkWallet(owner.id, {
    nonce: solWrongKey.data.nonce,
    signature: solanaAttacker.sign(solWrongKey.data.message),
    provider: "PHANTOM",
  });
  check("a Solana signature from a different key is rejected",
    !solForged.ok && solForged.error === "SIGNATURE_INVALID",
    solForged.ok ? "linked!" : solForged.error);

  // --- the verifier is never applied across families ------------------------
  check("an EVM signature does not verify as a Solana one",
    (await verifySignature(solChain, solana.address, "hello", signature)) === false, "refused");
  check("a Solana signature does not verify as an EVM one",
    (await verifySignature(evmChain, account.address, "hello", solana.sign("hello"))) === false,
    "refused");
  check("a Solana signature of the wrong length is refused",
    (await verifySignature(solChain, solana.address, "hello", base58.encode(new Uint8Array(32)))) === false,
    "refused");

  // --- the same address on two chains --------------------------------------
  const polygonChallenge = await createChallenge(owner.id, POLYGON, account.address);
  if (!polygonChallenge.ok) return finish();
  const polygonLink = await linkWallet(owner.id, {
    nonce: polygonChallenge.data.nonce,
    signature: await account.signMessage({ message: polygonChallenge.data.message }),
    provider: "METAMASK",
  });
  check("the same address can be linked on a second chain", polygonLink.ok,
    polygonLink.ok ? polygonLink.data.chainKey : polygonLink.error);

  const duplicate = await createChallenge(owner.id, BASE, account.address);
  if (!duplicate.ok) return finish();
  const duplicateLink = await linkWallet(owner.id, {
    nonce: duplicate.data.nonce,
    signature: await account.signMessage({ message: duplicate.data.message }),
    provider: "METAMASK",
  });
  check("the same address on the same chain is not linked twice",
    !duplicateLink.ok && duplicateLink.error === "ALREADY_LINKED",
    duplicateLink.ok ? "linked again!" : duplicateLink.error);

  // --- replay ---------------------------------------------------------------
  const replay = await linkWallet(owner.id, {
    nonce: challenge.data.nonce, signature, provider: "METAMASK",
  });
  check("the same challenge cannot be used twice",
    !replay.ok && replay.error === "CHALLENGE_USED", replay.ok ? "linked again!" : replay.error);

  // --- a signature from the wrong key ---------------------------------------
  const challenge2 = await createChallenge(owner.id, BASE, account.address);
  if (!challenge2.ok) return finish();

  const forged = await attacker.signMessage({ message: challenge2.data.message });
  const forgedLink = await linkWallet(owner.id, {
    nonce: challenge2.data.nonce, signature: forged, provider: "METAMASK",
  });
  check("a signature from a different key is rejected",
    !forgedLink.ok && forgedLink.error === "SIGNATURE_INVALID",
    forgedLink.ok ? "linked!" : forgedLink.error);

  const retry = await linkWallet(owner.id, {
    nonce: challenge2.data.nonce,
    signature: await account.signMessage({ message: challenge2.data.message }),
    provider: "METAMASK",
  });
  check("a failed attempt burns the challenge rather than allowing a retry",
    !retry.ok && retry.error === "CHALLENGE_USED", retry.ok ? "linked!" : retry.error);

  // --- someone else's challenge ---------------------------------------------
  const victimChallenge = await createChallenge(owner.id, BASE, account.address);
  if (!victimChallenge.ok) return finish();

  const stolen = await linkWallet(other.id, {
    nonce: victimChallenge.data.nonce,
    signature: await account.signMessage({ message: victimChallenge.data.message }),
    provider: "METAMASK",
  });
  check("another user cannot consume someone else's challenge",
    !stolen.ok && stolen.error === "CHALLENGE_NOT_FOUND", stolen.ok ? "linked!" : stolen.error);

  // --- a signature bound to a different address ------------------------------
  const boundChallenge = await createChallenge(owner.id, BASE, attacker.address);
  if (!boundChallenge.ok) return finish();

  const mismatched = await linkWallet(owner.id, {
    nonce: boundChallenge.data.nonce,
    signature: await account.signMessage({ message: boundChallenge.data.message }),
    provider: "METAMASK",
  });
  check("a signature cannot link an address it does not control",
    !mismatched.ok && mismatched.error === "SIGNATURE_INVALID",
    mismatched.ok ? "linked!" : mismatched.error);

  // --- expiry ----------------------------------------------------------------
  const expiring = await createChallenge(owner.id, BASE, account.address);
  if (!expiring.ok) return finish();
  await prisma.walletChallenge.update({
    where: { nonce: expiring.data.nonce },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await linkWallet(owner.id, {
    nonce: expiring.data.nonce,
    signature: await account.signMessage({ message: expiring.data.message }),
    provider: "METAMASK",
  });
  check("an expired challenge is refused",
    !expired.ok && expired.error === "CHALLENGE_EXPIRED", expired.ok ? "linked!" : expired.error);

  // --- primary and disconnect -------------------------------------------------
  check("a later wallet is not primary",
    (await prisma.wallet.findFirstOrThrow({
      where: { userId: owner.id, address: solana.address },
    })).isPrimary === false, "not primary");

  const promoted = await setPrimaryWallet(owner.id, solLinked.ok ? solLinked.data.walletId : "");
  check("primary can be changed", promoted.ok, promoted.ok ? "changed" : promoted.error);
  const primaries = await prisma.wallet.count({ where: { userId: owner.id, isPrimary: true } });
  check("exactly one wallet is primary", primaries === 1, `${primaries}`);

  const notMine = await setPrimaryWallet(other.id, solLinked.ok ? solLinked.data.walletId : "");
  check("someone else cannot promote your wallet",
    !notMine.ok && notMine.error === "NOT_FOUND", notMine.ok ? "promoted!" : notMine.error);

  const disconnected = await disconnectWallet(owner.id, solLinked.ok ? solLinked.data.walletId : "");
  check("a wallet can be disconnected", disconnected.ok, disconnected.ok ? "done" : disconnected.error);

  const stillThere = await prisma.wallet.findFirst({
    where: { userId: owner.id, address: solana.address },
    select: { disconnectedAt: true },
  });
  check("disconnecting is soft, so mint history survives",
    stillThere?.disconnectedAt !== null, "row retained");

  const reassigned = await prisma.wallet.count({
    where: { userId: owner.id, isPrimary: true, disconnectedAt: null },
  });
  check("primary moves to a remaining wallet", reassigned === 1, `${reassigned}`);

  // --- overview ----------------------------------------------------------------
  const overview = await getWalletOverview(owner.id);
  check("the overview lists only connected wallets", overview.wallets.length === 2,
    `${overview.wallets.length}`);
  check("the overview names each network",
    overview.wallets.every((wallet) => wallet.chainName.length > 0) &&
      overview.wallets.some((wallet) => wallet.chainName === "Base"),
    overview.wallets.map((wallet) => wallet.chainName).join(", "));

  const emptyOverview = await getWalletOverview(other.id);
  check("someone with no wallet sees nothing",
    emptyOverview.wallets.length === 0 && emptyOverview.eligible === 0, "empty");

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
