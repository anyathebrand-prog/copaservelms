/**
 * Demo data for showing the platform before real content exists.
 *
 * Creates pre-confirmed accounts, a published course with a full curriculum, a
 * finished learner and a partway one, a graded assignment, a discussion, a
 * scheduled live class, and an issued certificate — enough that every dashboard
 * has something in it.
 *
 * Accounts are created through Supabase Auth with email_confirm set, so they
 * work immediately: no confirmation mail to click, and none of the built-in
 * mailer's rate limit, which matters when several people sign in at a demo.
 *
 * Every record is tagged, so demo:clear removes exactly this and nothing else.
 *
 *   npm run demo:seed
 *   npm run demo:clear
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { issueCertificate } from "../lib/certificates/issue";
import { evaluateBadges } from "../lib/gamification";
import { createPost, addComment } from "../lib/discussions";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Every demo record carries this, so removal is exact rather than a guess. */
export const DEMO_TAG = "demo.copaserve.test";
const PASSWORD = process.env.DEMO_PASSWORD || "CopaServe-Demo-2026!";

type Person = {
  email: string;
  first: string;
  last: string;
  role?: "INSTRUCTOR" | "ADMIN" | "SUPER_ADMIN";
};

const PEOPLE: Person[] = [
  { email: `admin@${DEMO_TAG}`, first: "Amina", last: "Yusuf", role: "SUPER_ADMIN" },
  { email: `instructor@${DEMO_TAG}`, first: "Ibrahim", last: "Bello", role: "INSTRUCTOR" },
  { email: `student@${DEMO_TAG}`, first: "Chinelo", last: "Adeyemi" },
  { email: `student2@${DEMO_TAG}`, first: "Tunde", last: "Okafor" },
];

async function createPerson(person: Person): Promise<string> {
  const { error } = await supabase.auth.admin.createUser({
    email: person.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: person.first, last_name: person.last },
  });

  if (error && !/already/i.test(error.message)) {
    throw new Error(`${person.email}: ${error.message}`);
  }

  // The auth trigger creates the app user, profile, and STUDENT role.
  await new Promise((resolve) => setTimeout(resolve, 700));

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: person.email },
    select: { id: true },
  });

  if (person.role) {
    const role = await prisma.role.findFirstOrThrow({ where: { name: person.role } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log(`  ${person.email.padEnd(38)} ${person.role ?? "STUDENT"}`);
  return user.id;
}

async function main() {
  const existing = await prisma.user.count({ where: { email: { endsWith: DEMO_TAG } } });
  if (existing > 0) {
    console.log(`${existing} demo users already exist. Run demo:clear first to start fresh.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\nAccounts (password for all: ${PASSWORD})\n`);

  const adminId = await createPerson(PEOPLE[0]);
  const instructorId = await createPerson(PEOPLE[1]);
  const studentId = await createPerson(PEOPLE[2]);
  const student2Id = await createPerson(PEOPLE[3]);

  await prisma.profile.update({
    where: { userId: instructorId },
    data: {
      bio: "Data protection lead with fifteen years in financial services compliance.",
      profession: "Data Protection Officer",
    },
  });

  const dataProtection = await prisma.category.findFirstOrThrow({ where: { slug: "data-protection" } });
  const cyber = await prisma.category.findFirstOrThrow({ where: { slug: "cybersecurity" } });

  const course = await prisma.course.create({
    data: {
      title: "NDPA Foundations for Compliance Officers",
      slug: "demo-ndpa-foundations",
      subtitle: "What a Nigerian compliance officer needs to apply the NDPA in practice.",
      description:
        "A practical grounding in the Nigeria Data Protection Act 2023: what it covers, the lawful " +
        "bases, data subject rights, breach notification, and the obligations that fall on a Data " +
        "Protection Officer.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      instructorId,
      categoryId: dataProtection.id,
      level: "INTERMEDIATE",
      priceMinor: 4500000,
      currency: "NGN",
      estimatedMinutes: 320,
      isFeatured: true,
      certificateEnabled: true,
      minQuizScore: 70,
      modules: {
        create: [
          {
            title: "Foundations of the NDPA",
            position: 1,
            lessons: {
              create: [
                {
                  title: "What the NDPA covers", type: "TEXT", position: 1,
                  durationSeconds: 900, isPreview: true,
                  content: "The Nigeria Data Protection Act 2023 applies to the processing of personal data of people in Nigeria, whether or not the controller is based here.",
                },
                {
                  title: "Lawful bases for processing", type: "TEXT", position: 2, durationSeconds: 1200,
                  content: "Six lawful bases are available. Consent is only one of them, and rarely the strongest for ongoing processing.",
                },
                {
                  title: "Controller, processor, and DPO", type: "TEXT", position: 3, durationSeconds: 1080,
                  content: "Who decides the purpose of processing determines who carries the obligation.",
                },
              ],
            },
          },
          {
            title: "Rights and obligations in practice",
            position: 2,
            lessons: {
              create: [
                {
                  title: "Data subject rights", type: "TEXT", position: 1, durationSeconds: 1500,
                  content: "Access, correction, erasure, portability, objection, and withdrawal of consent.",
                },
                {
                  title: "Breach notification", type: "TEXT", position: 2, durationSeconds: 1320,
                  content: "A reportable breach must reach the Commission within 72 hours of awareness.",
                },
                {
                  title: "Building a compliance programme", type: "TEXT", position: 3, durationSeconds: 1800,
                  content: "Policies alone do not demonstrate compliance. Records, audits, and training do.",
                },
              ],
            },
          },
        ],
      },
      assignments: {
        create: [
          {
            title: "Draft a breach notification",
            instructions:
              "Write the notification you would send to the Commission for the scenario in Lesson 2.2. " +
              "Include what happened, the categories of data affected, and your remediation steps.",
            maxPoints: 100,
            allowedFileTypes: ["pdf", "docx"],
          },
        ],
      },
      quizzes: {
        create: [
          {
            title: "Foundations knowledge check",
            description: "Six questions covering Modules 1 and 2.",
            passingScore: 70,
            countsTowardCertificate: true,
            maxAttempts: 3,
            questions: {
              create: [
                {
                  type: "MULTIPLE_CHOICE", position: 1, points: 10,
                  prompt: "Which law governs personal data processing in Nigeria?",
                  options: ["NDPA 2023", "GDPR", "NITDA Guidelines 2019", "POPIA"],
                  correctAnswer: "NDPA 2023",
                  explanation: "The NDPA 2023 replaced the earlier NITDA framework as primary legislation.",
                },
                {
                  type: "TRUE_FALSE", position: 2, points: 10,
                  prompt: "Consent is always the strongest lawful basis for processing.",
                  correctAnswer: false,
                  explanation: "Consent can be withdrawn at any time, which makes it fragile for ongoing processing.",
                },
                {
                  type: "MULTIPLE_CHOICE", position: 3, points: 10,
                  prompt: "How long do you have to report a reportable breach?",
                  options: ["24 hours", "72 hours", "7 days", "30 days"],
                  correctAnswer: "72 hours",
                },
                {
                  type: "TRUE_FALSE", position: 4, points: 10,
                  prompt: "A data processor decides the purpose of processing.",
                  correctAnswer: false,
                  explanation: "The controller decides purpose and means; the processor acts on instruction.",
                },
                {
                  type: "CHECKBOX", position: 5, points: 10,
                  prompt: "Which of these are data subject rights under the NDPA?",
                  options: ["Access", "Correction", "Erasure", "Unlimited compensation"],
                  correctAnswer: ["Access", "Correction", "Erasure"],
                },
                {
                  type: "TRUE_FALSE", position: 6, points: 10,
                  prompt: "A Data Protection Officer must be able to act independently.",
                  correctAnswer: true,
                },
              ],
            },
          },
        ],
      },
    },
    select: {
      id: true,
      slug: true,
      modules: { select: { id: true, lessons: { select: { id: true } } } },
      quizzes: { select: { id: true } },
      assignments: { select: { id: true } },
    },
  });

  // A second course, so the catalogue is not a single card, and a free one so
  // the enrol-without-payment path can be shown.
  await prisma.course.create({
    data: {
      title: "Cybersecurity Essentials for Non-Technical Staff",
      slug: "demo-cyber-essentials",
      subtitle: "Practical security habits for people who do not work in IT.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      instructorId,
      categoryId: cyber.id,
      level: "BEGINNER",
      priceMinor: 0,
      estimatedMinutes: 120,
      certificateEnabled: true,
      modules: {
        create: [
          {
            title: "Everyday risks",
            position: 1,
            lessons: {
              create: [
                {
                  title: "Recognising phishing", type: "TEXT", position: 1,
                  durationSeconds: 600, isPreview: true,
                  content: "Most breaches start with a message that looks ordinary.",
                },
                {
                  title: "Passwords and MFA", type: "TEXT", position: 2, durationSeconds: 720,
                  content: "Reuse is the single biggest weakness in most organisations.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  const lessons = course.modules.flatMap((module) => module.lessons);

  // Chinelo has finished; Tunde is partway through, so progress views differ.
  const enrolment = await prisma.enrollment.create({
    data: {
      userId: studentId, courseId: course.id, status: "ACTIVE",
      startedAt: new Date(Date.now() - 12 * 86_400_000),
    },
  });

  for (const lesson of lessons) {
    await prisma.lessonProgress.create({
      data: {
        enrollmentId: enrolment.id, lessonId: lesson.id, userId: studentId,
        completed: true, completedAt: new Date(),
      },
    });
  }

  await prisma.enrollment.update({
    where: { id: enrolment.id },
    data: { status: "COMPLETED", progressPercent: 100, completedAt: new Date() },
  });

  const partial = await prisma.enrollment.create({
    data: {
      userId: student2Id, courseId: course.id, status: "ACTIVE", progressPercent: 33,
      startedAt: new Date(Date.now() - 3 * 86_400_000),
    },
  });

  for (const lesson of lessons.slice(0, 2)) {
    await prisma.lessonProgress.create({
      data: {
        enrollmentId: partial.id, lessonId: lesson.id, userId: student2Id,
        completed: true, completedAt: new Date(),
      },
    });
  }

  await prisma.quizAttempt.create({
    data: {
      quizId: course.quizzes[0].id, userId: studentId, enrollmentId: enrolment.id,
      attemptNumber: 1, status: "AUTO_GRADED", score: 50, maxScore: 60, passed: true,
      startedAt: new Date(Date.now() - 86_400_000), submittedAt: new Date(Date.now() - 86_400_000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: course.assignments[0].id, userId: studentId, enrollmentId: enrolment.id,
      status: "GRADED", attemptNumber: 1, submittedAt: new Date(Date.now() - 2 * 86_400_000),
      notes: "Draft notification attached, covering scope, categories affected, and remediation.",
      grade: 88, feedback: "Clear and well structured. Tighten the remediation timeline next time.",
      gradedById: instructorId, gradedAt: new Date(Date.now() - 86_400_000),
    },
  });

  await prisma.liveClass.create({
    data: {
      courseId: course.id,
      title: "Office hours: breach scenarios",
      description: "Bring a scenario from your own organisation.",
      provider: "ZOOM",
      joinUrl: "https://zoom.us/j/0000000000",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      endsAt: new Date(Date.now() + 5 * 86_400_000 + 3_600_000),
      status: "SCHEDULED",
    },
  });

  const post = await createPost(course.id, studentId, ["STUDENT"], {
    title: "Does the 72 hours run from discovery or from confirmation?",
    body: "If we suspect a breach on Friday and confirm it on Monday, when does the clock start?",
  });

  if (post.ok) {
    await addComment(post.data.id, instructorId, ["INSTRUCTOR"], {
      body:
        "From the point of awareness, which in practice means reasonable suspicion rather than final " +
        "confirmation. Start the clock on Friday and update the Commission as you learn more.",
    });
  }

  await createPost(course.id, instructorId, ["INSTRUCTOR"], {
    title: "Welcome to the cohort",
    body: "Introduce yourself below, and say which sector you work in.",
    isAnnouncement: true,
  });

  await evaluateBadges(studentId).catch(() => {});

  const issued = await issueCertificate(enrolment.id, { actorId: adminId, overrideApproval: true });

  console.log(`\ncourses:     demo-ndpa-foundations (paid), demo-cyber-essentials (free)`);

  if (issued.ok) {
    console.log(`certificate: ${issued.certificateNumber}`);
    console.log(`verify at:   ${process.env.NEXT_PUBLIC_VERIFICATION_BASE_URL}/${issued.credentialId}`);
  } else {
    console.log(`certificate: not issued (${issued.error}${issued.message ? ` — ${issued.message}` : ""})`);
  }

  console.log("\nSign in with any account above using the demo password.\n");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
