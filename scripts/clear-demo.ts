/**
 * Remove everything seed-demo created, and nothing else.
 *
 * Scoped by the demo email tag and the two demo course slugs, so it cannot
 * touch real accounts or content. Auth users are deleted last, because the
 * delete trigger soft-deletes the app row and would otherwise leave a redacted
 * record behind.
 *
 *   npm run demo:clear
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { getStorage, CERTIFICATE_BUCKET } from "../lib/storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_TAG = "demo.copaserve.test";
const DEMO_SLUGS = ["demo-ndpa-foundations", "demo-cyber-essentials"];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_TAG } },
    select: { id: true, email: true, supabaseUserId: true },
  });
  const ids = users.map((user) => user.id);

  if (ids.length === 0) {
    console.log("No demo data found.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Removing ${users.length} demo accounts and their content…`);

  // Stored certificate PDFs are not covered by row deletion.
  const certificates = await prisma.certificate.findMany({
    where: { userId: { in: ids } },
    select: { id: true, userId: true, certificateNumber: true },
  });

  const storage = getStorage(CERTIFICATE_BUCKET);
  for (const certificate of certificates) {
    await storage
      .remove(`${certificate.userId}/${certificate.certificateNumber}.pdf`)
      .catch(() => {});
  }

  const courses = await prisma.course.findMany({
    where: { OR: [{ slug: { in: DEMO_SLUGS } }, { instructorId: { in: ids } }] },
    select: { id: true },
  });
  const courseIds = courses.map((course) => course.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids } },
        { entityId: { in: [...ids, ...courseIds, ...certificates.map((c) => c.id)] } },
      ],
    },
  });
  await prisma.discussionLike.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: ids } } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dataSubjectRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.couponRedemption.deleteMany({ where: { userId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.certificate.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  for (const user of users) {
    if (user.supabaseUserId) {
      await supabase.auth.admin.deleteUser(user.supabaseUserId).catch(() => {});
    }
  }

  const [remainingUsers, remainingCourses] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
  ]);

  console.log(`Done. Users now: ${remainingUsers}, courses: ${remainingCourses}.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
