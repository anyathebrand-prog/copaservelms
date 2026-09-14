/**
 * Functional checks for course banners (PRD §10.3).
 *
 * The first upload path on the platform that accepts a file from a browser, so
 * the properties that matter are the hostile ones: only the owner can set a
 * banner, only a real image is stored, and the stored URL is one that does not
 * expire — a signed URL in a database column stops working after a week and
 * nobody finds out until the card is blank.
 *
 * Runs against real storage and removes what it creates.
 *
 *   npx tsx --env-file=.env scripts/verify-course-banner.ts
 */
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { clearCourseBanner, setCourseBanner } from "../lib/course-media";
import { COURSE_MEDIA_BUCKET } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];
const courses: string[] = [];

function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

async function makeUser(label: string, role: string) {
  const user = await prisma.user.create({
    data: {
      email: `banner-${label}-${RUN}@demo.local`,
      status: "ACTIVE",
      profile: { create: { firstName: label, lastName: "Person" } },
    },
    select: { id: true },
  });
  users.push(user.id);

  const found = await prisma.role.findUnique({ where: { name: role as never }, select: { id: true } });
  if (found) await prisma.userRole.create({ data: { userId: user.id, roleId: found.id } });
  return user.id;
}

/** A real PNG, so the decode step has something legitimate to accept. */
async function pngFile(width = 900, height = 500): Promise<File> {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 90, b: 30 } },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(bytes)], "banner.png", { type: "image/png" });
}

async function main() {
  const owner = await makeUser("owner", "INSTRUCTOR");
  const stranger = await makeUser("stranger", "INSTRUCTOR");

  const category = await prisma.category.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      title: `Banner ${RUN}`,
      slug: `banner-${RUN}`,
      status: "DRAFT",
      instructorId: owner,
      categoryId: category.id,
      priceMinor: 0,
    },
    select: { id: true },
  });
  courses.push(course.id);

  // --- ownership -------------------------------------------------------------
  const byStranger = await setCourseBanner(course.id, await pngFile(), stranger, ["INSTRUCTOR"]);
  check("another instructor cannot set your banner",
    !byStranger.ok && byStranger.error === "FORBIDDEN",
    byStranger.ok ? "accepted!" : byStranger.error);

  // --- what is and is not an image -------------------------------------------
  const notAnImage = new File([new TextEncoder().encode("<?php echo 'hello'; ?>")], "x.png", {
    type: "image/png",
  });
  const rejected = await setCourseBanner(course.id, notAnImage, owner, ["INSTRUCTOR"]);
  check("a file that only claims to be an image is refused",
    !rejected.ok && rejected.error === "INVALID",
    rejected.ok ? "stored!" : rejected.detail ?? rejected.error);

  const empty = new File([new Uint8Array()], "empty.png", { type: "image/png" });
  const emptyResult = await setCourseBanner(course.id, empty, owner, ["INSTRUCTOR"]);
  check("an empty file is refused", !emptyResult.ok, emptyResult.ok ? "stored!" : "refused");

  const wrongType = new File([new TextEncoder().encode("nope")], "x.svg", { type: "image/svg+xml" });
  const wrongTypeResult = await setCourseBanner(course.id, wrongType, owner, ["INSTRUCTOR"]);
  check("SVG is refused (it can carry script)",
    !wrongTypeResult.ok, wrongTypeResult.ok ? "stored!" : "refused");

  // --- the happy path ---------------------------------------------------------
  const saved = await setCourseBanner(course.id, await pngFile(), owner, ["INSTRUCTOR"]);
  check("the owner can set a banner", saved.ok, saved.ok ? "" : saved.detail ?? saved.error);
  if (!saved.ok) return finish();

  const url = saved.data.thumbnailUrl;
  check("the URL is public, not a signed one that expires",
    url.includes("/object/public/") && !url.includes("token="),
    url.slice(0, 84));

  const row = await prisma.course.findUniqueOrThrow({
    where: { id: course.id },
    select: { thumbnailUrl: true },
  });
  check("the course row points at it", row.thumbnailUrl === url);

  // Fetch it back the way a browser would.
  const response = await fetch(url);
  const type = response.headers.get("content-type") ?? "";
  check("it loads over plain HTTP with no credentials", response.ok, String(response.status));
  check("and it was re-encoded to WebP", type.includes("image/webp"), type);

  const meta = await sharp(new Uint8Array(await response.arrayBuffer())).metadata();
  check("resized to the 16:9 card shape",
    meta.width === 1280 && meta.height === 720, `${meta.width}x${meta.height}`);

  check("stored under the course, not under a caller-supplied name",
    url.includes(`/${COURSE_MEDIA_BUCKET}/courses/${course.id}/`) && !url.includes("banner.png"),
    url.split(`/${COURSE_MEDIA_BUCKET}/`)[1] ?? "");

  // --- replacing, then removing ------------------------------------------------
  const replaced = await setCourseBanner(course.id, await pngFile(700, 700), owner, ["INSTRUCTOR"]);
  check("a banner can be replaced", replaced.ok && replaced.data.thumbnailUrl !== url,
    replaced.ok ? "new URL" : "failed");

  if (replaced.ok) {
    // Asked of the bucket, not over HTTP. Public objects are served through a
    // CDN, and the fetch above populated its cache — so a deleted file keeps
    // answering 200 for a while and an HTTP check reports a deletion that did
    // happen as a deletion that did not.
    check("and the previous file is deleted", !(await objectExists(url)), url.split("/").pop() ?? "");
  }

  const cleared = await clearCourseBanner(course.id, owner, ["INSTRUCTOR"]);
  const after = await prisma.course.findUniqueOrThrow({
    where: { id: course.id },
    select: { thumbnailUrl: true },
  });
  check("a banner can be removed", cleared.ok && after.thumbnailUrl === null,
    String(after.thumbnailUrl));

  if (replaced.ok) {
    check("removing deletes the file too", !(await objectExists(replaced.data.thumbnailUrl)));
  }

  return finish();
}

/** Is the object behind this public URL still in the bucket? */
async function objectExists(url: string): Promise<boolean> {
  const marker = `/${COURSE_MEDIA_BUCKET}/`;
  const key = decodeURIComponent(url.slice(url.indexOf(marker) + marker.length).split("?")[0]!);
  const folder = key.slice(0, key.lastIndexOf("/"));
  const name = key.slice(key.lastIndexOf("/") + 1);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await supabase.storage.from(COURSE_MEDIA_BUCKET).list(folder, { limit: 100 });
  return (data ?? []).some((file) => file.name === name);
}

async function cleanup() {
  await prisma.course.deleteMany({ where: { id: { in: courses } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log("\n" + passed + "/" + results.length + " passed");
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (cause) => {
    console.error(cause);
    console.log(results.join("\n"));
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
