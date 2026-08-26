import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getQuizForStudent } from "@/lib/quizzes";

/**
 * GET /api/quizzes/:quizId — quiz delivery for an enrolled student.
 *
 * Exists because `questions` is instructor-only under RLS: any student-readable
 * policy would also expose "correctAnswer", since RLS is row-level. The answer
 * key is excluded at the query level here and never leaves the server.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const result = await getQuizForStudent(prisma, quizId, user.id);

  if (!result.ok) {
    switch (result.error) {
      case "ATTEMPT_LIMIT_REACHED":
        return NextResponse.json(
          { error: "You have used all available attempts for this quiz." },
          { status: 403 },
        );
      // NOT_ENROLLED and NOT_FOUND deliberately collapse to the same response.
      default:
        return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
    }
  }

  return NextResponse.json(result.quiz, { headers: { "Cache-Control": "no-store" } });
}
