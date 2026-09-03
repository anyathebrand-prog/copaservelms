import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getCourseText, validateQuestion, type QuestionInput } from "@/lib/quiz-authoring";

/**
 * Drafting quiz questions from lesson text (PRD §5.2, "AI Quiz Generator").
 *
 * The important word is *drafting*. This never writes to the database. It
 * returns candidate questions into the authoring screen, where an instructor
 * reads each one, edits it, and chooses whether to keep it. Nothing reaches a
 * learner without a person having agreed to it.
 *
 * That is not caution for its own sake. These courses end in a certificate
 * asserting the holder was taught something correct. A model-written question
 * with a wrong answer key does not produce a bad quiz — it produces a
 * certificate that attests to a falsehood, signed by an institution. The
 * review step is the whole feature; generation is the convenience.
 *
 * Configured through ANTHROPIC_API_KEY. Absent, generation reports itself as
 * unavailable and authoring by hand is unaffected — the same shape as the
 * email and SMS drivers.
 */

/**
 * Deliberately loose on the answer, tight everywhere else.
 *
 * `correctAnswer` is a string even for true/false, because a schema that
 * accepts a union here makes the model's job ambiguous. It is narrowed to a
 * boolean on the way out.
 */
const DraftedQuestion = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE"]),
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.string(),
  explanation: z.string(),
});

const DraftedQuiz = z.object({
  questions: z.array(DraftedQuestion),
});

export type GenerationError = "NOT_CONFIGURED" | "NO_CONTENT" | "NOT_FOUND" | "FAILED";
export type Result<T> = { ok: true; data: T } | { ok: false; error: GenerationError; detail?: string };

export function generationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You write assessment questions for a Nigerian professional
certification platform. The learner has just read the lesson text you are given
and is being tested on whether they understood it.

Rules you must follow:

- Every question must be answerable from the supplied lesson text alone. Never
  test outside knowledge, however basic it seems.
- Test understanding, not recall of wording. A question answerable by matching
  a phrase from the text tests reading, not learning.
- The correct answer must be unambiguously correct and the distractors
  unambiguously wrong. A plausible-but-arguable distractor makes the question
  unfair and the certificate that follows it worthless.
- Distractors should be mistakes a learner might actually make, not obvious
  filler. "None of the above" is filler.
- For MULTIPLE_CHOICE supply between three and five options, and set
  correctAnswer to the exact text of one of them.
- For TRUE_FALSE supply an empty options array and set correctAnswer to the
  string "true" or "false".
- The explanation states why the answer is right, in one or two sentences, and
  is shown to the learner after they answer.
- Write in British English, and in the register of the lesson text.

You are drafting for a human instructor who will review, edit and approve each
question before any learner sees it. Where the lesson text is thin on a point,
write fewer questions rather than padding with weak ones.`;

/**
 * Draft questions for a course.
 *
 * Returns candidates only. The caller shows them for review; nothing is saved
 * until an instructor saves it.
 */
export async function draftQuestions(
  courseId: string,
  count: number,
): Promise<Result<{ questions: QuestionInput[]; rejected: number }>> {
  if (!generationConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  const course = await getCourseText(courseId);
  if (!course) return { ok: false, error: "NOT_FOUND" };

  const lessons = course.modules.flatMap((module) =>
    module.lessons
      .filter((lesson) => (lesson.content ?? "").trim().length > 0)
      .map((lesson) => `## ${module.title} — ${lesson.title}\n\n${lesson.content}`),
  );

  if (lessons.length === 0) {
    return {
      ok: false,
      error: "NO_CONTENT",
      detail: "This course has no written lesson text to draft questions from.",
    };
  }

  const wanted = Math.min(Math.max(count, 1), 15);

  try {
    const client = new Anthropic();

    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Writing fair questions with unambiguous distractors is exactly the kind
      // of judgement worth thinking about before answering.
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Draft ${wanted} questions for the course "${course.title}".

${course.description ? `Course description: ${course.description}\n` : ""}
Lesson text follows.

${lessons.join("\n\n---\n\n")}`,
        },
      ],
      output_config: { format: zodOutputFormat(DraftedQuiz) },
    });

    const drafted = response.parsed_output?.questions ?? [];

    // Validate through the same function that guards hand-written questions.
    // A drafted question that would be refused on save is dropped here rather
    // than shown to an instructor as something they can keep.
    const questions: QuestionInput[] = [];
    let rejected = 0;

    for (const question of drafted) {
      const candidate: QuestionInput = {
        type: question.type,
        prompt: question.prompt,
        options: question.type === "MULTIPLE_CHOICE" ? question.options : [],
        correctAnswer:
          question.type === "TRUE_FALSE"
            ? question.correctAnswer.trim().toLowerCase() === "true"
            : question.correctAnswer,
        explanation: question.explanation,
        points: 10,
      };

      if (validateQuestion(candidate) === null) questions.push(candidate);
      else rejected += 1;
    }

    if (questions.length === 0) {
      return { ok: false, error: "FAILED", detail: "Nothing usable came back. Try again." };
    }

    return { ok: true, data: { questions, rejected } };
  } catch (cause) {
    if (cause instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "NOT_CONFIGURED", detail: "The Anthropic API key was rejected." };
    }
    if (cause instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "FAILED", detail: "Rate limited. Try again shortly." };
    }

    console.error("[quiz-generation] drafting failed", cause);
    return { ok: false, error: "FAILED", detail: "Drafting failed. Try again." };
  }
}
