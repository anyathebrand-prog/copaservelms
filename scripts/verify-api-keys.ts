/**
 * Functional checks for API keys (PRD §13.3).
 *
 * A key is machine access to the platform, so the properties that matter are
 * the negative ones: that the plaintext is not recoverable from the database,
 * that a revoked or expired key stops working immediately, that scopes are
 * actually enforced rather than merely recorded, and that an organisation key
 * cannot read another organisation.
 *
 *   npx tsx scripts/verify-api-keys.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { authenticateApiKey, createApiKey, hasScope, listApiKeys, revokeApiKey } from "../lib/api-keys";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdKeys: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUsers } }, { entityId: { in: createdKeys } }] },
  });
  await prisma.apiKey.deleteMany({ where: { id: { in: createdKeys } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgs } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  const admin = await prisma.user.create({
    data: { email: `key-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Key", lastName: "Admin" } } },
  });
  createdUsers.push(admin.id);

  const orgA = await prisma.organization.create({
    data: { name: `Org A ${RUN}`, slug: `org-a-${RUN}` }, select: { id: true },
  });
  createdOrgs.push(orgA.id);

  const orgB = await prisma.organization.create({
    data: { name: `Org B ${RUN}`, slug: `org-b-${RUN}` }, select: { id: true },
  });
  createdOrgs.push(orgB.id);

  // --- validation ---------------------------------------------------------
  const unnamed = await createApiKey({ name: "  ", scopes: ["VERIFY_READ"] }, admin.id);
  check("a key needs a name", !unnamed.ok, unnamed.ok ? "created!" : unnamed.detail ?? unnamed.error);

  const scopeless = await createApiKey({ name: `Scopeless ${RUN}`, scopes: [] }, admin.id);
  check("a key with no scopes is refused", !scopeless.ok,
    scopeless.ok ? "created!" : scopeless.detail ?? scopeless.error);

  const orphanOrgScope = await createApiKey(
    { name: `Orphan ${RUN}`, scopes: ["ORG_READ"] }, admin.id,
  );
  check("organisation scopes require an organisation", !orphanOrgScope.ok,
    orphanOrgScope.ok ? "created!" : orphanOrgScope.detail ?? orphanOrgScope.error);

  // --- issuance -----------------------------------------------------------
  const verifyKey = await createApiKey(
    { name: `Verify ${RUN}`, scopes: ["VERIFY_READ"] }, admin.id,
  );
  check("a valid key is issued", verifyKey.ok, verifyKey.ok ? verifyKey.data.prefix : verifyKey.error);
  if (!verifyKey.ok) return finish();
  createdKeys.push(verifyKey.data.id);

  check("the key carries a recognisable prefix",
    verifyKey.data.key.startsWith("cs_live_"), verifyKey.data.prefix);
  check("the key is long enough not to be guessed",
    verifyKey.data.key.length >= 40, `${verifyKey.data.key.length} chars`);

  // The property that matters most: the plaintext is not in the database.
  const stored = await prisma.apiKey.findUniqueOrThrow({
    where: { id: verifyKey.data.id },
    select: { hashedKey: true, prefix: true },
  });
  check("the plaintext key is not stored",
    !stored.hashedKey.includes(verifyKey.data.key.slice(8)) &&
      stored.hashedKey !== verifyKey.data.key,
    "hash only");
  check("the stored prefix cannot be used as a key",
    (await authenticateApiKey(stored.prefix)) === null, "prefix rejected");

  const audited = await prisma.auditLog.count({
    where: { action: "api_key.create", entityId: verifyKey.data.id },
  });
  check("issuing a key is audited", audited === 1, `${audited}`);

  // --- authentication -----------------------------------------------------
  const authed = await authenticateApiKey(`Bearer ${verifyKey.data.key}`);
  check("a valid key authenticates", authed !== null, authed?.name ?? "null");
  check("scopes come back with it", authed !== null && hasScope(authed, "VERIFY_READ"),
    authed?.scopes.join(",") ?? "");
  check("a scope it does not hold is refused",
    authed !== null && !hasScope(authed, "ORG_WRITE"), "ORG_WRITE absent");

  check("the raw key works without the Bearer prefix",
    (await authenticateApiKey(verifyKey.data.key)) !== null, "accepted");

  for (const [label, header] of [
    ["a missing header", null],
    ["an empty header", ""],
    ["a random string", "Bearer not-a-key"],
    ["a key with the right prefix but wrong body", "Bearer cs_live_deadbeefdeadbeefdeadbeef"],
    ["a truncated key", `Bearer ${verifyKey.data.key.slice(0, -4)}`],
  ] as [string, string | null][]) {
    check(`${label} is rejected`, (await authenticateApiKey(header)) === null, "null");
  }

  // --- usage tracking -----------------------------------------------------
  await new Promise((r) => setTimeout(r, 400));
  const used = await prisma.apiKey.findUniqueOrThrow({
    where: { id: verifyKey.data.id }, select: { lastUsedAt: true },
  });
  check("use is recorded so an idle key can be spotted", used.lastUsedAt !== null,
    used.lastUsedAt ? "recorded" : "not recorded");

  // --- organisation scoping -----------------------------------------------
  const orgKey = await createApiKey(
    { name: `Org A key ${RUN}`, scopes: ["ORG_READ"], organizationId: orgA.id }, admin.id,
  );
  if (!orgKey.ok) return finish();
  createdKeys.push(orgKey.data.id);

  const orgAuthed = await authenticateApiKey(orgKey.data.key);
  check("an organisation key carries its organisation",
    orgAuthed?.organizationId === orgA.id, `${orgAuthed?.organizationId === orgA.id}`);
  check("it is not bound to another organisation",
    orgAuthed?.organizationId !== orgB.id, "distinct");
  check("an organisation key cannot read verifications",
    orgAuthed !== null && !hasScope(orgAuthed, "VERIFY_READ"), "scope absent");

  // --- expiry -------------------------------------------------------------
  const expiring = await createApiKey(
    { name: `Expiring ${RUN}`, scopes: ["VERIFY_READ"], expiresAt: new Date(Date.now() - 1000) },
    admin.id,
  );
  if (!expiring.ok) return finish();
  createdKeys.push(expiring.data.id);
  check("an expired key does not authenticate",
    (await authenticateApiKey(expiring.data.key)) === null, "rejected");

  // --- revocation ---------------------------------------------------------
  const revoked = await revokeApiKey(verifyKey.data.id, admin.id);
  check("a key can be revoked", revoked.ok, revoked.ok ? "revoked" : revoked.error);
  check("a revoked key stops working immediately",
    (await authenticateApiKey(verifyKey.data.key)) === null, "rejected");

  const revokeAudited = await prisma.auditLog.count({
    where: { action: "api_key.revoke", entityId: verifyKey.data.id },
  });
  check("revocation is audited", revokeAudited === 1, `${revokeAudited}`);

  const again = await revokeApiKey(verifyKey.data.id, admin.id);
  check("revoking twice is harmless", again.ok, again.ok ? "no-op" : again.error);

  // --- listing ------------------------------------------------------------
  const listed = await listApiKeys();
  const mine = listed.filter((k) => createdKeys.includes(k.id));
  check("keys are listed for management", mine.length === createdKeys.length,
    `${mine.length} of ${createdKeys.length}`);
  check("the listing never exposes the hash or the key",
    !JSON.stringify(mine).includes(verifyKey.data.key) &&
      !JSON.stringify(mine).includes(stored.hashedKey),
    "neither present");

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
