/**
 * Publish the demonstration course catalogue.
 *
 * Content lives in scripts/courses/; this file only puts it in the database.
 *
 * Idempotent. A course that already has enrolments keeps its content, so
 * re-running this cannot delete somebody's progress.
 *
 *   npx tsx --env-file=.env scripts/seed-courses.ts
 *   npx tsx --env-file=.env scripts/seed-courses.ts --remove
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../app/generated/prisma/client";
import { CORE_COURSES, type Course } from "./courses/catalogue";
import { SKILL_COURSES } from "./courses/skills";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const COURSES: Course[] = [...CORE_COURSES, ...SKILL_COURSES];

/**
 * Categories the catalogue needs.
 *
 * Created if absent rather than assumed: the professional-skills courses sit
 * outside the compliance categories the platform launched with, and a course
 * silently filed under nothing is a course nobody browses to.
 */
const CATEGORIES: { name: string; slug: string; description: string }[] = [
  {
    name: "Professional Development",
    slug: "professional-development",
    description: "Working well: attention, priorities, and writing people act on.",
  },
  {
    name: "Design",
    slug: "design",
    description: "Presenting work so it is read, understood and believed.",
  },
];

async function ensureCategories() {
  for (const category of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { slug: category.slug } });
    if (existing) continue;

    await prisma.category.create({ data: category });
    console.log(`  CATEGORY  ${category.name}`);
  }
}

// ---------------------------------------------------------------------------

async function instructorId(): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: "INSTRUCTOR" } } }, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: "faculty@demo.copaserve.test",
      status: "ACTIVE",
      profile: { create: { firstName: "CopaServe", lastName: "Faculty" } },
    },
    select: { id: true },
  });

  const role = await prisma.role.findUnique({ where: { name: "INSTRUCTOR" }, select: { id: true } });
  if (role) await prisma.userRole.create({ data: { userId: created.id, roleId: role.id } });

  return created.id;
}

async function publish(course: Course, teacher: string) {
  const category = await prisma.category.findFirst({
    where: { name: course.category },
    select: { id: true },
  });

  const existing = await prisma.course.findUnique({
    where: { slug: course.slug },
    select: { id: true, _count: { select: { enrollments: true } } },
  });

  // Never rebuild content underneath someone who is part-way through it:
  // deleting a module cascades to lessons, and lesson progress with it.
  if (existing && existing._count.enrollments > 0) {
    console.log(`  SKIP  ${course.slug} — ${existing._count.enrollments} enrolment(s), content left alone`);
    return;
  }

  if (existing) {
    await prisma.module.deleteMany({ where: { courseId: existing.id } });
    await prisma.quiz.deleteMany({ where: { courseId: existing.id } });
  }

  const minutes = course.modules.reduce(
    (sum, module) => sum + module.lessons.reduce((s, lesson) => s + lesson.minutes, 0),
    0,
  );

  const data = {
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    status: "PUBLISHED" as const,
    level: course.level,
    priceMinor: 0,
    currency: "NGN",
    estimatedMinutes: minutes,
    isFeatured: course.featured ?? false,
    publishedAt: new Date(),
    certificateEnabled: true,
    instructorId: teacher,
    ...(category ? { categoryId: category.id } : {}),
  } satisfies Prisma.CourseUncheckedCreateInput | Prisma.CourseUncheckedUpdateInput;

  const saved = existing
    ? await prisma.course.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.course.create({ data: { ...data, slug: course.slug }, select: { id: true } });

  for (const [index, module] of course.modules.entries()) {
    await prisma.module.create({
      data: {
        courseId: saved.id,
        title: module.title,
        description: module.description,
        position: index,
        lessons: {
          create: module.lessons.map((lesson, position) => ({
            title: lesson.title,
            type: "TEXT" as const,
            content: lesson.body,
            position,
            durationSeconds: lesson.minutes * 60,
            // The first lesson of the first module is readable before enrolling,
            // so the catalogue can show the writing rather than describe it.
            isPreview: index === 0 && position === 0,
          })),
        },
      },
    });
  }

  await prisma.quiz.create({
    data: {
      courseId: saved.id,
      title: course.quiz.title,
      description: course.quiz.description,
      passingScore: course.quiz.passingScore,
      countsTowardCertificate: true,
      showAnswersAfter: true,
      questions: {
        create: course.quiz.questions.map((question, position) => ({
          type: question.type,
          prompt: question.prompt,
          options: (question.options ?? []) as Prisma.InputJsonValue,
          correctAnswer: question.correctAnswer as Prisma.InputJsonValue,
          explanation: question.explanation,
          points: 10,
          position: position + 1,
        })),
      },
    },
  });

  const lessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  console.log(
    `  ${existing ? "UPDATED" : "CREATED"}  ${course.slug} — ${course.modules.length} modules, ${lessons} lessons, ${course.quiz.questions.length} questions, ~${minutes} min`,
  );
}

async function remove() {
  for (const course of COURSES) {
    const existing = await prisma.course.findUnique({
      where: { slug: course.slug },
      select: { id: true, _count: { select: { enrollments: true } } },
    });
    if (!existing) continue;

    if (existing._count.enrollments > 0) {
      console.log(`  SKIP  ${course.slug} — has enrolments, not deleting`);
      continue;
    }

    await prisma.course.delete({ where: { id: existing.id } });
    console.log(`  REMOVED  ${course.slug}`);
  }
}

async function main() {
  if (process.argv.includes("--remove")) {
    console.log("Removing demonstration courses:");
    await remove();
    return;
  }

  console.log("Publishing demonstration courses:");
  await ensureCategories();
  const teacher = await instructorId();
  for (const course of COURSES) await publish(course, teacher);

  const published = await prisma.course.count({ where: { status: "PUBLISHED" } });
  console.log(`\n${published} published course(s) in the catalogue.`);
  console.log(
    "\nThese are demonstration materials. Have a subject-matter expert review them\n" +
      "before anyone is certified on the strength of them.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
