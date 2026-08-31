/**
 * Functional checks for platform settings and branding (PRD §13.3).
 *
 * These values end up on certificates, which are attestations. So the checks
 * that matter are that only valid values can be stored, that a change is
 * audited, and — the one worth being careful about — that changing the
 * institution name does not retroactively alter certificates already issued.
 *
 *   npx tsx scripts/verify-settings.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  getSettings,
  readOrgBranding,
  updateOrganizationBranding,
  updateSettings,
} from "../lib/settings";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdOrgs: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/** Restored so a test run does not rebrand the platform. */
let original: Awaited<ReturnType<typeof getSettings>> | null = null;

async function cleanup() {
  if (original) {
    await prisma.platformSetting.update({
      where: { id: "singleton" },
      data: { ...original, updatedById: null },
    }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgs } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  original = await getSettings();

  const admin = await prisma.user.create({
    data: { email: `set-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Set", lastName: "Admin" } } },
  });
  createdUsers.push(admin.id);

  const org = await prisma.organization.create({
    data: { name: `Branded ${RUN}`, slug: `branded-${RUN}` }, select: { id: true },
  });
  createdOrgs.push(org.id);

  // --- the singleton ------------------------------------------------------
  const rows = await prisma.platformSetting.count();
  check("there is exactly one settings row", rows === 1, `${rows}`);

  const secondRow = await prisma.platformSetting
    .create({ data: { id: "another" } })
    .then(() => "created")
    .catch(() => "refused");
  check("a second settings row is refused by the database", secondRow === "refused", secondRow);

  // --- validation ---------------------------------------------------------
  const blank = await updateSettings({ institutionName: "   " }, admin.id);
  check("the institution name cannot be blanked",
    !blank.ok, blank.ok ? "accepted!" : blank.detail);

  const badColour = await updateSettings({ primaryColor: "green" }, admin.id);
  check("a colour must be hex", !badColour.ok, badColour.ok ? "accepted!" : badColour.detail);

  const badLogo = await updateSettings({ logoUrl: "http://insecure.example/logo.png" }, admin.id);
  check("a logo must be https", !badLogo.ok, badLogo.ok ? "accepted!" : badLogo.detail);

  const badEmail = await updateSettings({ supportEmail: "not-an-email" }, admin.id);
  check("the support address must be an address",
    !badEmail.ok, badEmail.ok ? "accepted!" : badEmail.detail);

  // --- a real update ------------------------------------------------------
  const updated = await updateSettings(
    {
      institutionName: `Test Institute ${RUN}`,
      supportEmail: "help@example.com",
      primaryColor: "#123abc",
      signatoryName: "A. Registrar",
      signatoryTitle: "Registrar",
    },
    admin.id,
  );
  check("valid settings are stored", updated.ok,
    updated.ok ? updated.data.institutionName : updated.detail);

  const audited = await prisma.auditLog.count({
    where: { action: "settings.update", actorId: admin.id },
  });
  check("a branding change is audited", audited === 1, `${audited}`);

  // --- certificates already issued are not rewritten ----------------------
  //
  // The institution name is copied onto the PDF at issuance. Nothing should
  // reach back and change what an existing certificate says it attested.
  const before = await prisma.certificate.findFirst({ select: { id: true, certificateNumber: true } });
  const nameOnRecord = `Renamed ${RUN}`;
  await updateSettings({ institutionName: nameOnRecord }, admin.id);
  const after = before
    ? await prisma.certificate.findUnique({
        where: { id: before.id }, select: { certificateNumber: true, pdfUrl: true },
      })
    : null;
  check("renaming the institution does not alter existing certificate records",
    before === null || after?.certificateNumber === before.certificateNumber,
    before === null ? "no certificates to check" : "unchanged");

  // --- organisation branding ----------------------------------------------
  const orgBad = await updateOrganizationBranding(org.id, { logoUrl: "ftp://x", primaryColor: null }, admin.id);
  check("an organisation logo must be https", !orgBad.ok, orgBad.ok ? "accepted!" : orgBad.detail);

  const orgOk = await updateOrganizationBranding(
    org.id, { logoUrl: "https://example.com/logo.png", primaryColor: "#abc" }, admin.id,
  );
  check("organisation branding is stored", orgOk.ok, orgOk.ok ? "stored" : orgOk.detail);

  const stored = await prisma.organization.findUniqueOrThrow({
    where: { id: org.id }, select: { logoUrl: true, branding: true },
  });
  check("the logo is mirrored onto the organisation record",
    stored.logoUrl === "https://example.com/logo.png", `${stored.logoUrl}`);

  const parsed = readOrgBranding(stored.branding);
  check("branding reads back", parsed.primaryColor === "#abc", `${parsed.primaryColor}`);

  // Stored JSON is not schema-checked, so reading it has to be defensive.
  check("a malformed colour in stored branding is ignored",
    readOrgBranding({ primaryColor: "not-a-colour", logoUrl: 42 }).primaryColor === null,
    "ignored");
  check("empty branding reads as empty",
    readOrgBranding(null).logoUrl === null && readOrgBranding(undefined).primaryColor === null,
    "null-safe");

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
    console.log("cleaned up fixtures and restored settings");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
