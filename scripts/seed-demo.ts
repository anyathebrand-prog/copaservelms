/**
 * Demo content for local development.
 *
 * Separate from prisma/seed.ts on purpose: that one holds reference data that
 * production genuinely needs (roles, categories, badges), while this creates
 * fake users and courses that must never reach a real database.
 *
 * Run with:
 *   DIRECT_URL=postgres://... npx tsx scripts/seed-demo.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

// Refuse to run anywhere that looks like the hosted database.
if (!url || /supabase|pooler\.supabase\.com/i.test(url)) {
  console.error(
    "Refusing to run: seed-demo.ts is for local databases only. Point DIRECT_URL at a local Postgres.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "data-protection" } });

  const instructor = await prisma.user.upsert({
    where: { email: "instructor@demo.local" },
    update: {},
    create: {
      email: "instructor@demo.local",
      status: "ACTIVE",
      profile: { create: { firstName: "Tunde", lastName: "Bakare", profession: "Lead DPO" } },
      roles: { create: { role: { connect: { name: "INSTRUCTOR" } } } },
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@demo.local" },
    update: {},
    create: {
      email: "student@demo.local",
      status: "ACTIVE",
      profile: {
        create: {
          firstName: "Chidi",
          lastName: "Nwosu",
          profession: "Compliance Analyst",
          xpPoints: 320,
          currentStreak: 4,
          learningMinutes: 260,
        },
      },
      roles: { create: { role: { connect: { name: "STUDENT" } } } },
    },
  });

  const course = await prisma.course.upsert({
    where: { slug: "ndpa-foundations" },
    update: {},
    create: {
      title: "NDPA Foundations",
      slug: "ndpa-foundations",
      subtitle: "The Nigeria Data Protection Act, end to end, for practitioners.",
      description:
        "A practical grounding in the NDPA 2023: lawful bases, data subject rights, breach response, and the DPO role.",
      status: "PUBLISHED",
      isFeatured: true,
      level: "BEGINNER",
      priceMinor: 0,
      estimatedMinutes: 180,
      publishedAt: new Date(),
      instructorId: instructor.id,
      categoryId: category.id,
      minQuizScore: 70,
      modules: {
        create: [
          {
            title: "Foundations",
            position: 1,
            lessons: {
              create: [
                { title: "What the NDPA covers", type: "TEXT", position: 1, durationSeconds: 600, isPreview: true, content: "The Nigeria Data Protection Act 2023 establishes the legal framework for processing personal data in Nigeria." },
                { title: "Lawful bases for processing", type: "TEXT", position: 2, durationSeconds: 900, content: "Consent, contract, legal obligation, vital interests, public interest, and legitimate interests." },
              ],
            },
          },
          {
            title: "In practice",
            position: 2,
            lessons: {
              create: [
                { title: "Data subject rights", type: "TEXT", position: 1, durationSeconds: 720, content: "Access, correction, erasure, withdrawal of consent, objection, and portability." },
                { title: "Breach response", type: "TEXT", position: 2, durationSeconds: 840, content: "Detection, containment, assessment, notification timelines, and record-keeping." },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId: course.id } },
    update: {},
    create: { userId: student.id, courseId: course.id, status: "ACTIVE", startedAt: new Date() },
  });

  const existingQuiz = await prisma.quiz.findFirst({ where: { courseId: course.id } });
  if (!existingQuiz) {
    await prisma.quiz.create({
      data: {
        courseId: course.id,
        title: "Foundations check",
        description: "Five minutes, covering module 1.",
        passingScore: 70,
        maxAttempts: 3,
        timeLimitMinutes: 5,
        questions: {
          create: [
            { type: "MULTIPLE_CHOICE", position: 1, points: 2, prompt: "Which law governs data protection in Nigeria?", options: ["NDPA 2023", "GDPR", "HIPAA"], correctAnswer: "NDPA 2023" },
            { type: "TRUE_FALSE", position: 2, points: 1, prompt: "A Data Protection Officer must be able to act independently.", correctAnswer: true },
            { type: "CHECKBOX", position: 3, points: 3, prompt: "Which of these are lawful bases for processing?", options: ["Consent", "Contract", "Convenience"], correctAnswer: ["Consent", "Contract"] },
            { type: "ESSAY", position: 4, points: 4, prompt: "Explain data minimisation in your own words." },
          ],
        },
      },
    });
  }

  const existingAssignment = await prisma.assignment.findFirst({ where: { courseId: course.id } });
  if (!existingAssignment) {
    await prisma.assignment.create({
      data: {
        courseId: course.id,
        title: "Draft a breach notification",
        instructions: "Write a notification to the Commission for a hypothetical breach affecting 500 records.",
        maxPoints: 100,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRequiredForCertificate: true,
      },
    });
  }

  console.log(`✔ demo content ready — student=${student.email} course=${course.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
