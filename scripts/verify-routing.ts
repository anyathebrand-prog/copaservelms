/**
 * Functional checks for role-based portal routing (PRD §8.2, §9-§13).
 *
 * Reported from the live site: the admin, instructor, and student dashboards
 * all looked the same. They were not — sign-in simply sent everyone to
 * /student, and no navigation linked across areas, so nobody ever saw the
 * other two.
 *
 * These assert the rule that fixes it, and that role precedence is stable when
 * someone holds several roles at once, which is normal here: everyone receives
 * STUDENT at signup.
 *
 *   npx tsx scripts/verify-routing.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { dashboardPathFor } from "../lib/roles";
import type { CurrentUser } from "../lib/auth";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

function asUser(roles: string[]): CurrentUser {
  return { id: "x", email: "x@example.test", roles, status: "ACTIVE" } as CurrentUser;
}

async function main() {
  // --- the routing rule ---------------------------------------------------
  check("a student lands on the student portal",
    dashboardPathFor(asUser(["STUDENT"])) === "/student",
    dashboardPathFor(asUser(["STUDENT"])));

  check("an instructor lands on the instructor portal",
    dashboardPathFor(asUser(["STUDENT", "INSTRUCTOR"])) === "/instructor",
    dashboardPathFor(asUser(["STUDENT", "INSTRUCTOR"])));

  check("an admin lands on the admin portal",
    dashboardPathFor(asUser(["STUDENT", "ADMIN"])) === "/admin",
    dashboardPathFor(asUser(["STUDENT", "ADMIN"])));

  check("a super admin lands on the admin portal",
    dashboardPathFor(asUser(["STUDENT", "SUPER_ADMIN"])) === "/admin",
    dashboardPathFor(asUser(["STUDENT", "SUPER_ADMIN"])));

  // Roles accumulate, so precedence has to be deterministic rather than
  // dependent on the order they happen to come back from the database.
  check("the most privileged role wins when several are held",
    dashboardPathFor(asUser(["STUDENT", "INSTRUCTOR", "ADMIN"])) === "/admin",
    dashboardPathFor(asUser(["STUDENT", "INSTRUCTOR", "ADMIN"])));

  check("role order does not change the destination",
    dashboardPathFor(asUser(["ADMIN", "INSTRUCTOR", "STUDENT"])) ===
      dashboardPathFor(asUser(["STUDENT", "INSTRUCTOR", "ADMIN"])),
    "stable");

  check("someone with no roles still lands somewhere usable",
    dashboardPathFor(asUser([])) === "/student", dashboardPathFor(asUser([])));

  // --- real users, as the trigger actually creates them --------------------
  const student = await prisma.user.create({
    data: { email: `rt-student-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "R", lastName: "S" } },
      roles: { create: { role: { connect: { name: "STUDENT" } } } } },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  createdUsers.push(student.id);

  const instructor = await prisma.user.create({
    data: { email: `rt-instructor-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "R", lastName: "I" } },
      roles: { create: [
        { role: { connect: { name: "STUDENT" } } },
        { role: { connect: { name: "INSTRUCTOR" } } },
      ] } },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  createdUsers.push(instructor.id);

  const admin = await prisma.user.create({
    data: { email: `rt-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "R", lastName: "A" } },
      roles: { create: [
        { role: { connect: { name: "STUDENT" } } },
        { role: { connect: { name: "SUPER_ADMIN" } } },
      ] } },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  createdUsers.push(admin.id);

  const roleNames = (u: { roles: { role: { name: string } }[] }) => u.roles.map((r) => r.role.name);

  check("a real student routes to /student",
    dashboardPathFor(asUser(roleNames(student))) === "/student", roleNames(student).join(","));
  check("a real instructor routes to /instructor",
    dashboardPathFor(asUser(roleNames(instructor))) === "/instructor", roleNames(instructor).join(","));
  check("a real super admin routes to /admin",
    dashboardPathFor(asUser(roleNames(admin))) === "/admin", roleNames(admin).join(","));

  // --- the sign-in flow no longer hard-codes a destination ----------------
  const fs = await import("node:fs/promises");

  const form = await fs.readFile("components/auth/auth-form.tsx", "utf8");
  check("the sign-in form defers to /portal rather than assuming /student",
    form.includes('?? "/portal"') && !form.includes('?? "/student"'),
    form.includes('?? "/portal"') ? "defers" : "still hard-coded");

  const callback = await fs.readFile("app/auth/callback/route.ts", "utf8");
  check("magic link and OAuth callbacks defer too",
    callback.includes('?? "/portal"') && !callback.includes('?? "/student"'),
    callback.includes('?? "/portal"') ? "defers" : "still hard-coded");

  const portal = await fs.readFile("app/portal/route.ts", "utf8");
  check("the resolver uses the shared rule rather than repeating it",
    portal.includes("dashboardPathFor"), "shared");

  // --- the areas are genuinely different pages ----------------------------
  const [studentPage, instructorPage, adminPage] = await Promise.all([
    fs.readFile("app/(portal)/student/page.tsx", "utf8"),
    fs.readFile("app/(portal)/instructor/page.tsx", "utf8"),
    fs.readFile("app/(portal)/admin/page.tsx", "utf8"),
  ]);

  check("the three dashboards are distinct pages",
    studentPage !== instructorPage && instructorPage !== adminPage && studentPage !== adminPage,
    "distinct");

  const [studentLayout, instructorLayout, adminLayout] = await Promise.all([
    fs.readFile("app/(portal)/student/layout.tsx", "utf8"),
    fs.readFile("app/(portal)/instructor/layout.tsx", "utf8"),
    fs.readFile("app/(portal)/admin/layout.tsx", "utf8"),
  ]);

  check("each area uses its own navigation",
    studentLayout.includes("<Sidebar") &&
      instructorLayout.includes("InstructorSidebar") &&
      adminLayout.includes("AdminSidebar"),
    "three sidebars");

  const shell = await fs.readFile("app/(portal)/layout.tsx", "utf8");
  check("the portal shell offers a way to switch between areas",
    shell.includes("AreaSwitcher"), "switcher present");

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
