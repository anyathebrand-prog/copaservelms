/**
 * Functional checks for the pre-launch waitlist (PRD §7.2, §12.1).
 *
 * Two properties are worth testing and both are about consent rather than
 * about the list.
 *
 * The first: what someone agreed to is recorded verbatim, so consent can be
 * shown rather than asserted. A version pointer would not survive the copy
 * being edited, which it will be.
 *
 * The second: withdrawal sticks. An unsubscribed row must never be re-invited,
 * must never appear in an export, and must not be quietly resurrected by
 * someone re-importing an old list. That last one is the failure that actually
 * happens in the wild, and it is the one a data-protection platform would least
 * like to be caught doing.
 *
 *   npx tsx --env-file=.env scripts/verify-waitlist.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  CONSENT_TEXT,
  exportWaitlistCsv,
  getWaitlistSummary,
  joinWaitlist,
  listWaitlist,
  markInvited,
  unsubscribe,
} from "../lib/waitlist";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const emails: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

function addr(label: string) {
  const email = `wait-${label}-${RUN}@demo.local`;
  emails.push(email);
  return email;
}

async function cleanup() {
  await prisma.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
}

async function main() {
  // --- validation -----------------------------------------------------------
  const bad = await joinWaitlist({ email: "not-an-email" });
  check("a malformed address is refused",
    !bad.ok && bad.error === "INVALID_EMAIL", bad.ok ? "accepted!" : bad.error);

  const noDomain = await joinWaitlist({ email: "someone@localhost" });
  check("an address with no real domain is refused", !noDomain.ok,
    noDomain.ok ? "accepted!" : "refused");

  // --- joining ---------------------------------------------------------------
  const email = addr("one");
  const joined = await joinWaitlist({
    email: `  ${email.toUpperCase()}  `,
    name: "  Ada Okonkwo  ",
    organisation: "Zenith Bank",
    interest: "Data Protection (NDPA)",
    source: "landing",
    ipAddress: "102.89.0.1",
    userAgent: "test-agent",
  });
  check("someone can join", joined.ok && joined.data.alreadyOn === false,
    joined.ok ? "added" : joined.error);

  const row = await prisma.waitlistEntry.findUnique({ where: { email } });
  check("the address is stored lowercased and trimmed", row !== null, row?.email ?? "missing");
  check("whitespace is trimmed off the other fields", row?.name === "Ada Okonkwo",
    `"${row?.name}"`);

  // --- the consent record ------------------------------------------------------
  check("the exact wording agreed to is stored, not a version pointer",
    row?.consentText === CONSENT_TEXT, `${row?.consentText?.slice(0, 40)}...`);
  check("consent is timestamped", row?.consentedAt instanceof Date, `${row?.consentedAt}`);
  check("where the consent came from is recorded",
    row?.ipAddress === "102.89.0.1" && row?.userAgent === "test-agent", "ip and agent");
  check("an unsubscribe link exists before anything has been sent",
    (row?.unsubscribeToken?.length ?? 0) >= 24, `${row?.unsubscribeToken?.length} chars`);

  // --- joining twice -----------------------------------------------------------
  const again = await joinWaitlist({ email: email.toUpperCase() });
  check("joining twice does not duplicate the row",
    again.ok && again.data.alreadyOn === true, again.ok ? "recognised" : again.error);

  const count = await prisma.waitlistEntry.count({ where: { email } });
  check("exactly one row exists for that address", count === 1, `${count}`);

  const secondName = await prisma.waitlistEntry.findUnique({ where: { email } });
  check("a second signup does not wipe what they told us the first time",
    secondName?.name === "Ada Okonkwo", `${secondName?.name}`);

  // --- withdrawal ---------------------------------------------------------------
  const token = row!.unsubscribeToken;
  const out = await unsubscribe(token);
  check("the unsubscribe link works", out.ok, out.ok ? out.data.email : out.error);

  const afterOut = await prisma.waitlistEntry.findUnique({ where: { email } });
  check("the row is kept as a suppression record rather than deleted",
    afterOut !== null && afterOut.status === "UNSUBSCRIBED", `${afterOut?.status}`);
  check("their name and organisation are dropped, since neither is needed to leave them alone",
    afterOut?.name === null && afterOut?.organisation === null, "cleared");

  const twice = await unsubscribe(token);
  check("unsubscribing twice is harmless", twice.ok, twice.ok ? "fine" : twice.error);

  const nonsense = await unsubscribe("not-a-real-token");
  check("an unknown token is refused",
    !nonsense.ok && nonsense.error === "NOT_FOUND", nonsense.ok ? "accepted!" : nonsense.error);

  // --- withdrawal sticks ----------------------------------------------------------
  const reInvite = await markInvited([afterOut!.id]);
  check("an unsubscribed person cannot be marked invited",
    reInvite.ok && reInvite.data.invited === 0, `${reInvite.ok ? reInvite.data.invited : ""} invited`);

  const csv = await exportWaitlistCsv();
  check("an unsubscribed address never appears in an export",
    !csv.includes(email), "absent");

  // --- but they can change their mind -----------------------------------------------
  const rejoined = await joinWaitlist({ email, ipAddress: "102.89.0.2" });
  check("someone who unsubscribed can choose to come back", rejoined.ok,
    rejoined.ok ? "rejoined" : rejoined.error);

  const back = await prisma.waitlistEntry.findUnique({ where: { email } });
  check("coming back records fresh consent rather than reviving the old one",
    back?.status === "PENDING" && back.unsubscribedAt === null && back.ipAddress === "102.89.0.2",
    `${back?.status}`);

  // --- invitations --------------------------------------------------------------------
  const second = addr("two");
  await joinWaitlist({ email: second, name: "Chidi", interest: "Cybersecurity" });
  const secondRow = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: second } });

  const invited = await markInvited([secondRow.id]);
  check("someone waiting can be marked invited",
    invited.ok && invited.data.invited === 1, `${invited.ok ? invited.data.invited : ""}`);

  const invitedRow = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: second } });
  check("the invitation is timestamped",
    invitedRow.status === "INVITED" && invitedRow.invitedAt !== null, `${invitedRow.status}`);

  const twiceInvited = await markInvited([secondRow.id]);
  check("marking an already-invited person again does nothing",
    twiceInvited.ok && twiceInvited.data.invited === 0, "no change");

  // --- reporting --------------------------------------------------------------------
  const summary = await getWaitlistSummary();
  check("the summary counts the list", summary.total >= 2, `${summary.total} total`);
  check("unsubscribed people are counted apart from the list",
    typeof summary.unsubscribed === "number", `${summary.unsubscribed}`);

  const listed = await listWaitlist("INVITED");
  check("the list can be filtered by status",
    listed.every((entry) => entry.status === "INVITED"), `${listed.length} invited`);

  const exported = await exportWaitlistCsv();
  check("the export includes someone still on the list", exported.includes(second), "present");
  check("the export carries the consent timestamp, not just the address",
    exported.split("\n")[0]!.includes("consented_at"), exported.split("\n")[0]!);

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
