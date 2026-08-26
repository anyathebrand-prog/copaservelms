/**
 * Functional checks for the privacy centre (PRD §12).
 *
 * The things worth proving here: consent is an append-only history rather than
 * a flag, a data export contains the subject's data and nobody else's, and a
 * resolution to a rights request always leaves an audit record.
 *
 *   LOCAL=postgres://... DATABASE_URL=$LOCAL npx tsx scripts/verify-privacy.ts
 *
 * Every fixture is namespaced with a per-run suffix and removed afterwards, so
 * this leaves no residue. Cleanup runs even when an assertion fails.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  createDataRequest,
  exportUserData,
  getConsentHistory,
  getConsentState,
  getDataRequests,
  recordConsent,
  resolveDataRequest,
  updateCommunicationPrefs,
} from "../lib/privacy";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.LOCAL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];

// Tracked so cleanup can remove exactly what this run created.
const createdUsers: string[] = [];
const createdRequests: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/**
 * Remove this run's fixtures.
 *
 * ConsentLog uses onDelete: Restrict — deliberately, so real history cannot be
 * cascaded away — so those rows are deleted explicitly before the users. Audit
 * entries are removed by entityId for the same reason.
 */
async function cleanup(userIds: string[], requestIds: string[]) {
  if (userIds.length === 0) return;

  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: [...userIds, ...requestIds] } }] },
  });
  await prisma.consentLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.dataSubjectRequest.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const subject = await prisma.user.create({
    data: {
      email: `subject-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Ngozi", lastName: "Eze", profession: "DPO" } },
      roles: { create: { role: { connect: { name: "STUDENT" } } } },
    },
  });

  createdUsers.push(subject.id);

  const other = await prisma.user.create({
    data: {
      email: `bystander-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Someone", lastName: "Else" } },
    },
  });

  createdUsers.push(other.id);

  const admin = await prisma.user.create({
    data: {
      email: `dpo-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: "Compliance", lastName: "Officer" } },
      roles: { create: { role: { connect: { name: "ADMIN" } } } },
    },
  });

  createdUsers.push(admin.id);

  // --- consent ------------------------------------------------------------
  const fresh = await getConsentState(subject.id);
  check("no consent is granted by default",
    fresh.every((c) => !c.granted), `${fresh.filter((c) => c.granted).length} granted`);

  await recordConsent({ userId: subject.id, type: "MARKETING_EMAIL", action: "GRANTED", policyVersion: "v1" });
  let state = await getConsentState(subject.id);
  check("granting consent is reflected in state",
    state.find((c) => c.type === "MARKETING_EMAIL")?.granted === true, "granted");

  await recordConsent({ userId: subject.id, type: "MARKETING_EMAIL", action: "WITHDRAWN" });
  state = await getConsentState(subject.id);
  check("withdrawal is reflected in state",
    state.find((c) => c.type === "MARKETING_EMAIL")?.granted === false, "withdrawn");

  // The point of a consent log: withdrawal must not erase the grant.
  const history = await getConsentHistory(subject.id);
  const marketing = history.filter((h) => h.type === "MARKETING_EMAIL");
  check("withdrawal appends rather than overwriting",
    marketing.length === 2 && marketing.some((h) => h.action === "GRANTED"),
    `${marketing.length} entries: ${marketing.map((h) => h.action).join(", ")}`);

  await recordConsent({ userId: subject.id, type: "MARKETING_EMAIL", action: "GRANTED" });
  state = await getConsentState(subject.id);
  check("state follows the newest entry, not the first",
    state.find((c) => c.type === "MARKETING_EMAIL")?.granted === true, "re-granted");

  // --- communication preferences -----------------------------------------
  await updateCommunicationPrefs(subject.id, { EMAIL: false, IN_APP: true, SMS: false, PUSH: false });
  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: subject.id } });
  const prefs = profile.communicationPrefs as Record<string, boolean>;
  check("communication preferences persist", prefs.EMAIL === false && prefs.IN_APP === true,
    JSON.stringify(prefs));

  // --- data requests ------------------------------------------------------
  const raised = await createDataRequest(subject.id, "ERASURE", "Please delete my account.");
  check("erasure request is raised", raised.ok, raised.ok ? raised.id : `error=${raised.error}`);
  if (raised.ok) createdRequests.push(raised.id);

  const duplicate = await createDataRequest(subject.id, "ERASURE", "Again");
  check("duplicate open request is refused", !duplicate.ok && duplicate.error === "DUPLICATE",
    duplicate.ok ? "created!" : `error=${duplicate.error}`);

  const differentType = await createDataRequest(subject.id, "CORRECTION", "My surname is misspelt.");
  check("a different request type is still allowed", differentType.ok,
    differentType.ok ? "created" : `error=${differentType.error}`);
  if (differentType.ok) createdRequests.push(differentType.id);

  const noResolution = await resolveDataRequest(admin.id, raised.ok ? raised.id : "", "COMPLETED", "   ");
  check("resolving without a written outcome is refused",
    !noResolution.ok && noResolution.error === "INVALID",
    noResolution.ok ? "resolved!" : `error=${noResolution.error}`);

  const resolved = await resolveDataRequest(
    admin.id,
    raised.ok ? raised.id : "",
    "COMPLETED",
    "Profile erased; certificate records retained under statutory obligation.",
  );
  check("request resolves with a recorded outcome", resolved.ok, resolved.ok ? "resolved" : `error=${resolved.error}`);

  const subjectRequests = await getDataRequests(subject.id);
  const erasure = subjectRequests.find((r) => r.type === "ERASURE");
  check("the subject can see the resolution",
    erasure?.status === "COMPLETED" && (erasure.resolution ?? "").includes("retained"),
    `${erasure?.status}`);

  const auditEntries = await prisma.auditLog.findMany({
    where: { entityType: "DataSubjectRequest", entityId: raised.ok ? raised.id : "" },
  });
  check("resolution writes an audit entry", auditEntries.length === 1,
    `${auditEntries.length} entries`);

  // --- export -------------------------------------------------------------
  const otherRequest = await createDataRequest(other.id, "ACCESS", "Bystander's own request");
  check("bystander fixture created", otherRequest.ok, otherRequest.ok ? "ok" : "failed");
  if (otherRequest.ok) createdRequests.push(otherRequest.id);

  const exported = await exportUserData(subject.id);
  const serialised = JSON.stringify(exported);

  check("export contains the subject's own data",
    serialised.includes(subject.email) && serialised.includes("Ngozi"), "present");
  check("export excludes other people's data",
    !serialised.includes(other.email) && !serialised.includes("Bystander"),
    serialised.includes(other.email) ? "LEAKED" : "clean");
  check("export includes consent history",
    (exported.consentHistory?.length ?? 0) >= 3, `${exported.consentHistory?.length} entries`);
  check("export includes rights requests",
    (exported.dataSubjectRequests?.length ?? 0) === 2, `${exported.dataSubjectRequests?.length}`);

  // An export that carried password hashes or internal ids would be a liability.
  check("export omits internal identifiers",
    !serialised.includes("supabaseUserId") && !serialised.includes('"id":'),
    "no internal ids");

  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup(createdUsers, createdRequests);
    console.log(`cleaned up ${createdUsers.length} fixture user(s)`);
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    // Cleanup runs even on failure, so a half-finished run leaves nothing behind.
    await cleanup(createdUsers, createdRequests).catch((e) =>
      console.error("cleanup failed — remove fixtures matching", RUN, ":", (e as Error).message),
    );
    await prisma.$disconnect();
    process.exit(1);
  });
