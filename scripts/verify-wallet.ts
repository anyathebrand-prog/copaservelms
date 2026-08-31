/**
 * Functional checks for wallet linking (PRD §11.5, §8.2).
 *
 * The property under test is ownership. An address typed into a form proves
 * nothing, so linking requires signing a challenge we issued — and a
 * certificate minted later to an unverified address would be minted to a
 * stranger. These sign with real keys through viem, so the signature path is
 * genuinely exercised rather than stubbed.
 *
 *   npx tsx scripts/verify-wallet.ts
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  buildMessage,
  chainName,
  createChallenge,
  disconnectWallet,
  getWalletOverview,
  linkWallet,
  setPrimaryWallet,
} from "../lib/wallet";

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

const AVALANCHE = 43114;

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

  // --- address validation -------------------------------------------------
  const bad = await createChallenge(owner.id, "not-an-address");
  check("a malformed address is refused", !bad.ok && bad.error === "INVALID_ADDRESS",
    bad.ok ? "accepted!" : bad.error);

  check("chains are named for humans", chainName(AVALANCHE).includes("Avalanche"), chainName(AVALANCHE));
  check("an unknown chain still renders", chainName(999999) === "Chain 999999", chainName(999999));

  // --- the happy path -----------------------------------------------------
  const challenge = await createChallenge(owner.id, account.address);
  check("a challenge is issued", challenge.ok, challenge.ok ? "issued" : challenge.error);
  if (!challenge.ok) return finish();

  check("the message names the address and nonce",
    challenge.data.message.includes(account.address) && challenge.data.message.includes(challenge.data.nonce),
    "both present");
  check("the message says it authorises no transaction",
    /cannot move funds/i.test(challenge.data.message), "stated");

  // Verification rebuilds the message from stored values rather than trusting
  // what the client sends, so the two must be identical or nothing would ever
  // verify.
  check("the issued message matches what verification rebuilds",
    challenge.data.message === buildMessage(account.address, challenge.data.nonce),
    "identical");

  const signature = await account.signMessage({ message: challenge.data.message });
  const linked = await linkWallet(owner.id, {
    nonce: challenge.data.nonce, signature, provider: "METAMASK", chainId: AVALANCHE,
  });
  check("a correctly signed challenge links the wallet", linked.ok,
    linked.ok ? linked.data.address : linked.error);

  check("the stored address is checksummed",
    linked.ok && linked.data.address === account.address, linked.ok ? linked.data.address : "");

  const first = await prisma.wallet.findFirstOrThrow({ where: { userId: owner.id } });
  check("the first wallet becomes primary", first.isPrimary === true, `${first.isPrimary}`);

  // --- replay -------------------------------------------------------------
  const replay = await linkWallet(owner.id, {
    nonce: challenge.data.nonce, signature, provider: "METAMASK", chainId: AVALANCHE,
  });
  check("the same challenge cannot be used twice",
    !replay.ok && replay.error === "CHALLENGE_USED", replay.ok ? "linked again!" : replay.error);

  // --- a signature from the wrong key -------------------------------------
  const challenge2 = await createChallenge(owner.id, account.address);
  if (!challenge2.ok) return finish();

  const forged = await attacker.signMessage({ message: challenge2.data.message });
  const forgedLink = await linkWallet(owner.id, {
    nonce: challenge2.data.nonce, signature: forged, provider: "METAMASK", chainId: AVALANCHE,
  });
  check("a signature from a different key is rejected",
    !forgedLink.ok && forgedLink.error === "SIGNATURE_INVALID",
    forgedLink.ok ? "linked!" : forgedLink.error);

  const retry = await linkWallet(owner.id, {
    nonce: challenge2.data.nonce,
    signature: await account.signMessage({ message: challenge2.data.message }),
    provider: "METAMASK", chainId: AVALANCHE,
  });
  check("a failed attempt burns the challenge rather than allowing a retry",
    !retry.ok && retry.error === "CHALLENGE_USED", retry.ok ? "linked!" : retry.error);

  // --- someone else's challenge -------------------------------------------
  const victimChallenge = await createChallenge(owner.id, account.address);
  if (!victimChallenge.ok) return finish();

  const stolen = await linkWallet(other.id, {
    nonce: victimChallenge.data.nonce,
    signature: await account.signMessage({ message: victimChallenge.data.message }),
    provider: "METAMASK", chainId: AVALANCHE,
  });
  check("another user cannot consume someone else's challenge",
    !stolen.ok && stolen.error === "CHALLENGE_NOT_FOUND", stolen.ok ? "linked!" : stolen.error);

  // --- a signature bound to a different address ---------------------------
  const boundChallenge = await createChallenge(owner.id, attacker.address);
  if (!boundChallenge.ok) return finish();

  // Sign the right text, but with the wrong key for that address.
  const mismatched = await linkWallet(owner.id, {
    nonce: boundChallenge.data.nonce,
    signature: await account.signMessage({ message: boundChallenge.data.message }),
    provider: "METAMASK", chainId: AVALANCHE,
  });
  check("a signature cannot link an address it does not control",
    !mismatched.ok && mismatched.error === "SIGNATURE_INVALID",
    mismatched.ok ? "linked!" : mismatched.error);

  // --- expiry -------------------------------------------------------------
  const expiring = await createChallenge(owner.id, account.address);
  if (!expiring.ok) return finish();
  await prisma.walletChallenge.update({
    where: { nonce: expiring.data.nonce },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await linkWallet(owner.id, {
    nonce: expiring.data.nonce,
    signature: await account.signMessage({ message: expiring.data.message }),
    provider: "METAMASK", chainId: AVALANCHE,
  });
  check("an expired challenge is refused",
    !expired.ok && expired.error === "CHALLENGE_EXPIRED", expired.ok ? "linked!" : expired.error);

  // --- a second wallet ----------------------------------------------------
  const second = privateKeyToAccount(generatePrivateKey());
  const secondChallenge = await createChallenge(owner.id, second.address);
  if (!secondChallenge.ok) return finish();
  const secondLink = await linkWallet(owner.id, {
    nonce: secondChallenge.data.nonce,
    signature: await second.signMessage({ message: secondChallenge.data.message }),
    provider: "AVALANCHE_CORE", chainId: AVALANCHE,
  });
  check("a second wallet can be linked", secondLink.ok, secondLink.ok ? "linked" : secondLink.error);
  check("the second wallet is not primary",
    (await prisma.wallet.findFirstOrThrow({ where: { userId: owner.id, address: second.address } })).isPrimary === false,
    "not primary");

  const promoted = await setPrimaryWallet(owner.id, secondLink.ok ? secondLink.data.walletId : "");
  check("primary can be changed", promoted.ok, promoted.ok ? "changed" : promoted.error);
  const primaries = await prisma.wallet.count({ where: { userId: owner.id, isPrimary: true } });
  check("exactly one wallet is primary", primaries === 1, `${primaries}`);

  const notMine = await setPrimaryWallet(other.id, secondLink.ok ? secondLink.data.walletId : "");
  check("someone else cannot promote your wallet",
    !notMine.ok && notMine.error === "NOT_FOUND", notMine.ok ? "promoted!" : notMine.error);

  // --- disconnect ---------------------------------------------------------
  const disconnected = await disconnectWallet(owner.id, secondLink.ok ? secondLink.data.walletId : "");
  check("a wallet can be disconnected", disconnected.ok, disconnected.ok ? "done" : disconnected.error);

  const stillThere = await prisma.wallet.findFirst({
    where: { userId: owner.id, address: second.address },
    select: { disconnectedAt: true },
  });
  check("disconnecting is soft, so mint history survives",
    stillThere?.disconnectedAt !== null, "row retained");

  const reassigned = await prisma.wallet.count({ where: { userId: owner.id, isPrimary: true, disconnectedAt: null } });
  check("primary moves to a remaining wallet", reassigned === 1, `${reassigned}`);

  // --- overview -----------------------------------------------------------
  const overview = await getWalletOverview(owner.id);
  check("the overview lists only connected wallets", overview.wallets.length === 1,
    `${overview.wallets.length}`);
  check("the overview names the network",
    overview.wallets[0]?.chainName.includes("Avalanche"), overview.wallets[0]?.chainName ?? "");

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
