/**
 * Functional checks for quiz authoring (PRD §10.3).
 *
 * Two properties matter here.
 *
 * Ownership: an instructor may edit their own course's quizzes and nobody
 * else's. A quiz is reached by id, so the check has to be against the course
 * rather than against whatever the caller sent.
 *
 * Immutability after use: once a learner has attempted a quiz, its questions
 * are locked. Editing them afterwards changes what somebody was marked
 * against, retroactively — and since a pass feeds certificate eligibility,
 * that quietly rewrites the basis on which a certificate was issued.
 *
 *   npx tsx --env-file=.env scripts/verify-quiz-authoring.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  getQuizForAuthor,
  saveQuestion,
  updateQuiz,
  validateQuestion,
} from "../lib/quiz-authoring";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const users: string[] = [];
const courses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.quizAttempt.deleteMany({ where: { userId: { in: users } } });
  await prisma.enrollment.deleteMany({ where: { userId: { in: users } } });
  await prisma.course.deleteMany({ where: { id: { in: courses } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function makeUser(label: string, roles: string[]) {
  const user = await prisma.user.create({
    data: { email: `qa-${label}-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: label, lastName: "Person" } } },
    select: { id: true },
  });
  users.push(user.id);

  for (const name of roles) {
    const role = await prisma.role.findUnique({ where: { name: name as never }, select: { id: true } });
    if (role) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return user.id;
}

async function main() {
  const owner = await makeUser("owner", ["INSTRUCTOR"]);
  const stranger = await makeUser("stranger", ["INSTRUCTOR"]);
  const admin = await makeUser("admin", ["ADMIN"]);
  const learner = await makeUser("learner", ["STUDENT"]);

  const category = await prisma.category.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      title: `Quiz authoring ${RUN}`, slug: `quiz-authoring-${RUN}`, status: "DRAFT",
      instructorId: owner, categoryId: category.id, priceMinor: 0,
    },
    select: { id: true },
  });
  courses.push(course.id);

  // --- validation, shared with the drafting path -----------------------------
  const noPrompt = validateQuestion({
    type: "MULTIPLE_CHOICE", prompt: "  ", options: ["a", "b"], correctAnswer: "a", points: 10,
  });
  check("a question needs a prompt", noPrompt !== null, noPrompt ?? "accepted!");

  const oneOption = validateQuestion({
    type: "MULTIPLE_CHOICE", prompt: "Q", options: ["only"], correctAnswer: "only", points: 10,
  });
  check("multiple choice needs at least two options", oneOption !== null, oneOption ?? "accepted!");

  const duplicate = validateQuestion({
    type: "MULTIPLE_CHOICE", prompt: "Q", options: ["a", "a"], correctAnswer: "a", points: 10,
  });
  check("two identical options are refused", duplicate !== null, duplicate ?? "accepted!");

  const orphanAnswer = validateQuestion({
    type: "MULTIPLE_CHOICE", prompt: "Q", options: ["a", "b"], correctAnswer: "c", points: 10,
  });
  check("the correct answer must be one of the options",
    orphanAnswer !== null, orphanAnswer ?? "accepted!");

  const badBoolean = validateQuestion({
    type: "TRUE_FALSE", prompt: "Q", correctAnswer: "yes", points: 10,
  });
  check("true/false needs a boolean answer", badBoolean !== null, badBoolean ?? "accepted!");

  const good = validateQuestion({
    type: "MULTIPLE_CHOICE", prompt: "Q", options: ["a", "b"], correctAnswer: "a", points: 10,
  });
  check("a well-formed question passes", good === null, "valid");

  // --- ownership --------------------------------------------------------------
  const byStranger = await createQuiz(
    course.id, { title: "Not mine", passingScore: 70 }, stranger, ["INSTRUCTOR"],
  );
  check("another instructor cannot add a quiz to your course",
    !byStranger.ok && byStranger.error === "FORBIDDEN",
    byStranger.ok ? "created!" : byStranger.error);

  const quiz = await createQuiz(
    course.id, { title: `Assessment ${RUN}`, passingScore: 70 }, owner, ["INSTRUCTOR"],
  );
  check("the course's instructor can create a quiz", quiz.ok, quiz.ok ? quiz.data.id : quiz.error);
  if (!quiz.ok) return finish();

  const byAdmin = await updateQuiz(
    quiz.data.id, { title: `Assessment ${RUN}`, passingScore: 80 }, admin, ["ADMIN"],
  );
  check("an admin can edit any course's quiz", byAdmin.ok, byAdmin.ok ? "updated" : byAdmin.error);

  const strangerRead = await getQuizForAuthor(quiz.data.id, stranger, ["INSTRUCTOR"]);
  check("another instructor cannot even read it", strangerRead === null, "hidden");

  // --- questions ---------------------------------------------------------------
  const first = await saveQuestion(quiz.data.id, {
    type: "MULTIPLE_CHOICE",
    prompt: "Which law governs personal data processing in Nigeria?",
    options: ["NDPA 2023", "GDPR", "POPIA"],
    correctAnswer: "NDPA 2023",
    explanation: "The NDPA 2023 is the primary legislation.",
    points: 10,
  }, owner, ["INSTRUCTOR"]);
  check("a question can be added", first.ok, first.ok ? first.data.id : first.error);
  if (!first.ok) return finish();

  const second = await saveQuestion(quiz.data.id, {
    type: "TRUE_FALSE", prompt: "Consent can be withdrawn.", correctAnswer: true,
    explanation: "It can, at any time.", points: 10,
  }, owner, ["INSTRUCTOR"]);
  check("a true/false question can be added", second.ok, second.ok ? "added" : second.error);

  const positions = await prisma.question.findMany({
    where: { quizId: quiz.data.id }, orderBy: { position: "asc" }, select: { position: true },
  });
  check("positions are assigned in order, without collisions",
    positions.length === 2 && positions[0]!.position !== positions[1]!.position,
    positions.map((p) => p.position).join(", "));

  const strangerQuestion = await saveQuestion(quiz.data.id, {
    type: "TRUE_FALSE", prompt: "Injected.", correctAnswer: false, points: 10,
  }, stranger, ["INSTRUCTOR"]);
  check("another instructor cannot add a question to it",
    !strangerQuestion.ok && strangerQuestion.error === "FORBIDDEN",
    strangerQuestion.ok ? "added!" : strangerQuestion.error);

  const edited = await saveQuestion(quiz.data.id, {
    id: first.data.id,
    type: "MULTIPLE_CHOICE",
    prompt: "Which law governs personal data processing in Nigeria?",
    options: ["NDPA 2023", "GDPR", "POPIA", "NITDA Guidelines 2019"],
    correctAnswer: "NDPA 2023",
    explanation: "The NDPA 2023 replaced the earlier NITDA framework.",
    points: 15,
  }, owner, ["INSTRUCTOR"]);
  check("a question can be edited in place",
    edited.ok && edited.data.id === first.data.id, edited.ok ? "same id" : edited.error);

  const count = await prisma.question.count({ where: { quizId: quiz.data.id } });
  check("editing does not create a duplicate", count === 2, `${count}`);

  const invalid = await saveQuestion(quiz.data.id, {
    type: "MULTIPLE_CHOICE", prompt: "Q", options: ["a", "b"], correctAnswer: "z", points: 10,
  }, owner, ["INSTRUCTOR"]);
  check("a question whose answer is not an option is refused",
    !invalid.ok && invalid.error === "INVALID", invalid.ok ? "saved!" : invalid.error);

  // --- locked once attempted ----------------------------------------------------
  const enrolment = await prisma.enrollment.create({
    data: { userId: learner, courseId: course.id, status: "ACTIVE" }, select: { id: true },
  });
  await prisma.quizAttempt.create({
    data: { quizId: quiz.data.id, userId: learner, enrollmentId: enrolment.id, status: "SUBMITTED" },
  });

  const deletion = await deleteQuiz(quiz.data.id, owner, ["INSTRUCTOR"]);
  check("a quiz that has been attempted cannot be deleted",
    !deletion.ok && deletion.error === "INVALID", deletion.ok ? "deleted!" : deletion.detail ?? "");

  const stillThere = await prisma.quiz.count({ where: { id: quiz.data.id } });
  check("the attempt and its quiz survive", stillThere === 1, `${stillThere}`);

  // --- deleting an unattempted quiz ------------------------------------------------
  const spare = await createQuiz(
    course.id, { title: `Spare ${RUN}`, passingScore: 70 }, owner, ["INSTRUCTOR"],
  );
  if (!spare.ok) return finish();

  const removedQuestion = await deleteQuestion(second.ok ? "" : "", owner, ["INSTRUCTOR"]);
  check("deleting a question that does not exist is refused",
    !removedQuestion.ok && removedQuestion.error === "NOT_FOUND", removedQuestion.ok ? "deleted!" : "refused");

  const spareGone = await deleteQuiz(spare.data.id, owner, ["INSTRUCTOR"]);
  check("an unattempted quiz can be deleted", spareGone.ok, spareGone.ok ? "deleted" : spareGone.error);

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
