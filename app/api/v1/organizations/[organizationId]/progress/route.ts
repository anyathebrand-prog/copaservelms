import { NextResponse } from "next/server";
import { authenticateApiKey, hasScope } from "@/lib/api-keys";
import { getOrganization } from "@/lib/organizations";

/**
 * GET /api/v1/organizations/:organizationId/progress
 *
 * Completion reporting for a corporate client's own staff (PRD §13.3), so an
 * HR system can pull training status rather than an admin exporting by hand.
 *
 * A key is bound to one organisation, and asking about another returns 403
 * rather than 404: the caller already knows the id they sent, so there is
 * nothing to protect by pretending it does not exist, and a clear answer stops
 * them retrying a request that will never work.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }
  if (!hasScope(key, "ORG_READ")) {
    return NextResponse.json({ error: "This key cannot read organisation data." }, { status: 403 });
  }

  const { organizationId } = await params;

  if (key.organizationId !== organizationId) {
    return NextResponse.json(
      { error: "This key is issued for a different organisation." },
      { status: 403 },
    );
  }

  const organization = await getOrganization(organizationId);
  if (!organization) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      organization: { id: organization.id, name: organization.name },
      summary: organization.summary,
      members: organization.memberships.map((member) => ({
        // Deliberately no user id: an HR system identifies people by the
        // address it enrolled, and internal ids are not theirs to hold.
        email: member.email,
        name: member.name,
        onboarded: member.hasSignedIn,
        courses: member.courses,
        completed: member.completed,
        averageProgress: member.averageProgress,
        enrolments: member.enrollments.map((enrolment) => ({
          course: enrolment.course.title,
          status: enrolment.status,
          progressPercent: enrolment.progressPercent,
          completedAt: enrolment.completedAt,
        })),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
