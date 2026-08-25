import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { gradeAttempt, type SubmittedAnswer } from "@/lib/quizzes";

/**
 * POST /api/quizzes/:quizId/attempts — submit and grade an attempt.
 *
 * The counterpart to delivery: because the client never receives the answer
 * key, scoring has to happen server-side. Objective types are graded here;
 * essay and short-answer questions are stored unscored for manual grading.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const answers = parseAnswers(body);
  if (!answers) {
    return NextResponse.json(
      { error: "Body must be { answers: [{ questionId, response }] }." },
      { status: 400 },
    );
  }

  const result = await gradeAttempt(prisma, quizId, user.id, answers);

  if (!result.ok) {
    switch (result.error) {
      case "ATTEMPT_LIMIT_REACHED":
        return NextResponse.json(
          { error: "You have used all available attempts for this quiz." },
          { status: 403 },
        );
      default:
        return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
    }
  }

  return NextResponse.json(result.result, { status: 201 });
}

function parseAnswers(body: unknown): SubmittedAnswer[] | null {
  if (typeof body !== "object" || body === null) return null;
  const { answers } = body as { answers?: unknown };
  if (!Array.isArray(answers)) return null;

  const parsed: SubmittedAnswer[] = [];
  for (const entry of answers) {
    if (typeof entry !== "object" || entry === null) return null;
    const { questionId, response } = entry as { questionId?: unknown; response?: unknown };
    if (typeof questionId !== "string" || !questionId) return null;
    parsed.push({ questionId, response: response ?? null });
  }
  return parsed;
}
