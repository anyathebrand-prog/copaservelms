/**
 * Checks for instructor-added training domains.
 *
 * The feature is one text box; the thing worth testing is what it refuses to
 * create. An open taxonomy fails by drift, not by abuse — "Cybersecurity" and
 * "Cyber Security" as two domains split the same courses across two filters —
 * so nearly every check here asserts that a new name resolved to an existing
 * domain instead of making another one.
 *
 *   npx tsx --env-file=.env scripts/verify-categories.ts
 */
import { prisma } from "../lib/prisma";
import { findOrCreateCategory, resolveCategoryFromForm, slugify } from "../lib/categories";

const results: string[] = [];
const check = (n: string, p: boolean, d = "") =>
  results.push((p ? "PASS  " : "FAIL  ") + n + (d ? " — " + d : ""));

/** Anything this run creates, removed at the end. */
const created: string[] = [];

async function main() {
  const before = await prisma.category.count();

  // --- existing domains are reused, however they are typed --------------------
  const sameThing: [string, string][] = [
    ["Cybersecurity", "cybersecurity"],
    ["cyber security", "cybersecurity"],
    ["  CYBERSECURITY  ", "cybersecurity"],
    ["Cyber-Security", "cybersecurity"],
    ["Data Protection", "data-protection"],
    ["data protection", "data-protection"],
    ["Risk Managements", "risk-management"],
    ["IT Governance", "it-governance"],
  ];

  for (const [typed, expectedSlug] of sameThing) {
    const result = await findOrCreateCategory(typed);
    if (!result.ok) {
      check(`"${typed}" resolves to an existing domain`, false, result.detail);
      continue;
    }
    const category = await prisma.category.findUnique({
      where: { id: result.data.id },
      select: { slug: true },
    });
    check(`"${typed}" joins ${expectedSlug} rather than making a new domain`,
      !result.data.created && category?.slug === expectedSlug,
      `${category?.slug} (created: ${result.data.created})`);
  }

  // --- a genuinely new domain is created --------------------------------------
  {
    const name = `Forensic Accounting ${Date.now()}`;
    const result = await findOrCreateCategory(name);
    check("a domain nobody has used is created", result.ok && result.data.created,
      result.ok ? result.data.name : result.detail);
    if (result.ok) created.push(result.data.id);

    // And typing it again does not make a second one.
    const again = await findOrCreateCategory(name.toLowerCase());
    check("typing it again reuses it", again.ok && !again.data.created,
      again.ok ? String(again.data.created) : again.detail);
  }

  // --- what it refuses ---------------------------------------------------------
  const refused = ["", " ", "a", "   ", "123", "!!!", "-", "x".repeat(61)];
  for (const bad of refused) {
    const result = await findOrCreateCategory(bad);
    check(`${JSON.stringify(bad).slice(0, 20)} is refused`, !result.ok,
      result.ok ? `created "${result.data.name}"` : result.detail);
  }

  // --- tidying -----------------------------------------------------------------
  {
    const result = await findOrCreateCategory(`  mining   safety ${Date.now()}  `);
    check("spacing is tidied and words capitalised",
      result.ok && /^Mining Safety \d+$/.test(result.data.name),
      result.ok ? result.data.name : result.detail);
    if (result.ok) created.push(result.data.id);
  }
  {
    const stamp = Date.now();
    const result = await findOrCreateCategory(`NDPA Practice ${stamp}`);
    check("deliberate capitals are left alone",
      result.ok && result.data.name.startsWith("NDPA Practice"),
      result.ok ? result.data.name : result.detail);
    if (result.ok) created.push(result.data.id);
  }

  // --- the form's precedence ----------------------------------------------------
  {
    const existing = await prisma.category.findFirst({ where: { slug: "compliance" }, select: { id: true } });
    const typedWins = await resolveCategoryFromForm(existing?.id ?? null, "Cybersecurity");
    const cyber = await prisma.category.findUnique({ where: { slug: "cybersecurity" }, select: { id: true } });
    check("a typed name beats the dropdown", typedWins.ok && typedWins.data.id === cyber?.id);

    const selectWins = await resolveCategoryFromForm(existing?.id ?? null, "   ");
    check("an empty box leaves the dropdown alone",
      selectWins.ok && selectWins.data.id === existing?.id);

    const neither = await resolveCategoryFromForm(null, null);
    check("neither means uncategorised", neither.ok && neither.data.id === null);
  }

  // --- slugify, the thing everything else depends on ----------------------------
  check("slugify collapses punctuation and case",
    slugify("Health & Safety!") === "health-and-safety", slugify("Health & Safety!"));
  check("slugify strips accents", slugify("Sécurité") === "securite", slugify("Sécurité"));

  // --- nothing crept in ---------------------------------------------------------
  const after = await prisma.category.count();
  check("only the genuinely new domains were added",
    after === before + created.length, `${before} -> ${after}, ${created.length} intended`);

  // --- the trace -----------------------------------------------------------------
  if (created.length > 0) {
    const audited = await prisma.auditLog.count({
      where: { action: "category.created", entityId: { in: created } },
    });
    check("new domains are written to the audit log", audited === created.length,
      `${audited}/${created.length}`);
  }

  if (created.length > 0) {
    await prisma.auditLog.deleteMany({ where: { action: "category.created", entityId: { in: created } } });
    const removed = await prisma.category.deleteMany({ where: { id: { in: created } } });
    console.log(`cleaned up ${removed.count} test domains\n`);
  }

  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(results.every((r) => r.startsWith("PASS")) ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  console.log(results.join("\n"));
  await prisma.$disconnect();
  process.exit(1);
});
