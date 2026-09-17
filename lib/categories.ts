import { prisma } from "@/lib/prisma";

/**
 * Training domains, and letting instructors add one.
 *
 * The ten seeded domains cover what CopaServe set out to teach, which is not
 * the same as what its instructors will teach. Someone arriving with a course
 * on forensic accounting should not have to file it under "Uncategorised" or
 * pick the nearest wrong thing, so the form takes a new name as well as a
 * choice from the list.
 *
 * The risk of an open taxonomy is not abuse, it is drift: "Cybersecurity",
 * "Cyber Security" and "cyber-security" become three domains that split the
 * same courses across three filters, and nobody notices until the catalogue
 * looks broken. So a typed name is matched against what already exists before
 * anything is created — by slug, which collapses case, punctuation and spacing,
 * and then by a loose comparison that also ignores "and", "&" and plurals.
 *
 * An existing match wins. That is deliberate: reusing a domain an instructor
 * did not pick from the list is a smaller surprise than a near-duplicate
 * appearing in the catalogue, and it is the behaviour that keeps the taxonomy
 * usable without an approval queue standing between a tutor and their course.
 */

export type CategoryError = "INVALID";
export type Result<T> = { ok: true; data: T } | { ok: false; error: CategoryError; detail: string };

const MAX_NAME = 60;
const MIN_NAME = 2;

/** URL-safe key. Also the comparison used to decide whether two names are one. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A looser key for near-duplicates.
 *
 * Drops the words that carry no distinction in a domain name and naive plurals,
 * so "Risk Management" and "risk-managements" collapse together, as do
 * "Health & Safety" and "health and safety".
 */
function comparisonKey(value: string): string {
  const words = slugify(value)
    .split("-")
    .filter((word) => word && !["and", "the", "of", "for", "in"].includes(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));

  // Joined with nothing, so a space is not a distinction: "cyber security" and
  // "Cybersecurity" are one domain, which word-by-word comparison misses — and
  // that pair splitting the catalogue is the exact failure this guards against.
  // Sorted, so word order does not matter either.
  return words.sort().join("");
}

/** Title-ish casing that leaves deliberate capitals alone (NDPA, IT, Web3). */
function tidyName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word === word.toUpperCase() || /\d/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * Find the domain this name means, or create it.
 *
 * Returns whether it already existed, so the caller can tell an instructor
 * their course was filed under something already on the list rather than
 * leaving them to notice.
 */
export async function findOrCreateCategory(
  rawName: string,
  actorId?: string,
): Promise<Result<{ id: string; name: string; created: boolean }>> {
  const name = tidyName(rawName);

  if (name.length < MIN_NAME) {
    return { ok: false, error: "INVALID", detail: "That domain name is too short." };
  }
  if (name.length > MAX_NAME) {
    return { ok: false, error: "INVALID", detail: `Keep the domain under ${MAX_NAME} characters.` };
  }
  if (!/[a-z]/i.test(name)) {
    return { ok: false, error: "INVALID", detail: "A domain name needs some letters in it." };
  }

  const slug = slugify(name);
  if (!slug) return { ok: false, error: "INVALID", detail: "That domain name cannot be used." };

  const existing = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });

  const exact = existing.find((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase());
  if (exact) return { ok: true, data: { id: exact.id, name: exact.name, created: false } };

  const key = comparisonKey(name);
  const near = existing.find((c) => comparisonKey(c.name) === key);
  if (near) return { ok: true, data: { id: near.id, name: near.name, created: false } };

  const category = await prisma.category.create({
    data: { name, slug },
    select: { id: true, name: true },
  });

  // Worth a trace: the public taxonomy just grew, and an admin who wants to
  // rename or merge it later needs to know it appeared and who added it.
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "category.created",
        entityType: "Category",
        entityId: category.id,
        after: { name: category.name, slug } as never,
      },
    });
  } catch {
    // A missing audit line must not cost the instructor their category.
  }

  return { ok: true, data: { id: category.id, name: category.name, created: true } };
}

/**
 * Work out which category a submitted form means.
 *
 * A typed name wins over the dropdown: someone who filled the box meant it,
 * and the select still holds whatever it defaulted to.
 */
export async function resolveCategoryFromForm(
  categoryId: string | null,
  newName: string | null,
  actorId?: string,
): Promise<Result<{ id: string | null; name: string | null; created: boolean }>> {
  const typed = newName?.trim();

  if (typed) {
    const result = await findOrCreateCategory(typed, actorId);
    if (!result.ok) return result;
    return { ok: true, data: { id: result.data.id, name: result.data.name, created: result.data.created } };
  }

  return { ok: true, data: { id: categoryId || null, name: null, created: false } };
}

/** Every domain, with how many published courses sit in it. */
export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { courses: true } },
    },
  });
}
