import { prisma } from "@/lib/prisma";

/**
 * Report definitions (PRD §13.2, §12.3).
 *
 * Each report returns plain rows with declared columns, so one renderer can
 * emit CSV, XLSX, or PDF without knowing what the data means. Adding a report
 * is adding an entry here, not a new export path.
 *
 * Reports contain personal data, so every export is audited — under the NDPA an
 * export is itself a processing activity (§12.3).
 */

export type ColumnType = "text" | "number" | "currency" | "percent" | "date";

export type Column = { key: string; label: string; type: ColumnType };

export type ReportRow = Record<string, string | number | Date | null>;

export type ReportData = {
  id: ReportId;
  title: string;
  description: string;
  generatedAt: Date;
  columns: Column[];
  rows: ReportRow[];
  /** Totals shown beneath the table, where a sum is meaningful. */
  summary?: { label: string; value: string }[];
};

export type ReportId =
  | "enrolments"
  | "revenue"
  | "completion"
  | "instructors"
  | "compliance";

export type DateRange = { from?: Date | null; to?: Date | null };

export const REPORTS: { id: ReportId; title: string; description: string }[] = [
  { id: "enrolments", title: "Enrolments", description: "Enrolments and completions by course." },
  { id: "revenue", title: "Revenue", description: "Successful payments, discounts, and refunds." },
  { id: "completion", title: "Student completion", description: "Per-learner progress and certificates." },
  { id: "instructors", title: "Instructor performance", description: "Courses, learners, and outcomes by instructor." },
  { id: "compliance", title: "Compliance", description: "Consent state and data subject requests (§12.3)." },
];

function withinRange(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

export async function buildReport(id: ReportId, range: DateRange = {}): Promise<ReportData> {
  const generatedAt = new Date();
  const meta = REPORTS.find((r) => r.id === id)!;

  switch (id) {
    case "enrolments": {
      const courses = await prisma.course.findMany({
        where: { enrollments: { some: {} } },
        select: {
          title: true,
          status: true,
          category: { select: { name: true } },
          instructor: { select: { profile: { select: { firstName: true, lastName: true } } } },
          enrollments: {
            where: { enrolledAt: withinRange(range) },
            select: { status: true, progressPercent: true, enrolledAt: true },
          },
        },
      });

      const rows: ReportRow[] = courses
        .filter((course) => course.enrollments.length > 0)
        .map((course) => {
          const total = course.enrollments.length;
          const completed = course.enrollments.filter((e) => e.status === "COMPLETED").length;
          return {
            course: course.title,
            category: course.category?.name ?? "Uncategorised",
            instructor:
              `${course.instructor.profile?.firstName ?? ""} ${course.instructor.profile?.lastName ?? ""}`.trim(),
            status: course.status.toLowerCase(),
            enrolments: total,
            completions: completed,
            completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
            averageProgress:
              total === 0
                ? 0
                : Math.round(course.enrollments.reduce((sum, e) => sum + e.progressPercent, 0) / total),
          };
        })
        .sort((a, b) => Number(b.enrolments) - Number(a.enrolments));

      const totalEnrolments = rows.reduce((sum, r) => sum + Number(r.enrolments), 0);
      const totalCompletions = rows.reduce((sum, r) => sum + Number(r.completions), 0);

      return {
        ...meta, generatedAt,
        columns: [
          { key: "course", label: "Course", type: "text" },
          { key: "category", label: "Category", type: "text" },
          { key: "instructor", label: "Instructor", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "enrolments", label: "Enrolments", type: "number" },
          { key: "completions", label: "Completions", type: "number" },
          { key: "completionRate", label: "Completion rate", type: "percent" },
          { key: "averageProgress", label: "Avg progress", type: "percent" },
        ],
        rows,
        summary: [
          { label: "Courses", value: String(rows.length) },
          { label: "Enrolments", value: String(totalEnrolments) },
          { label: "Completions", value: String(totalCompletions) },
          {
            label: "Overall completion rate",
            value: totalEnrolments === 0 ? "—" : `${Math.round((totalCompletions / totalEnrolments) * 100)}%`,
          },
        ],
      };
    }

    case "revenue": {
      const payments = await prisma.payment.findMany({
        where: { status: "SUCCESSFUL", paidAt: withinRange(range) },
        orderBy: { paidAt: "desc" },
        select: {
          reference: true, provider: true, amountMinor: true, discountMinor: true,
          refundedMinor: true, currency: true, couponCode: true, paidAt: true,
          course: { select: { title: true } },
          user: { select: { email: true } },
        },
      });

      const rows: ReportRow[] = payments.map((payment) => ({
        reference: payment.reference,
        date: payment.paidAt,
        course: payment.course?.title ?? "—",
        payer: payment.user.email,
        provider: payment.provider.toLowerCase(),
        coupon: payment.couponCode ?? "",
        // Kept in minor units in the data; the renderer formats currency.
        discount: payment.discountMinor,
        amount: payment.amountMinor,
        refunded: payment.refundedMinor,
        net: payment.amountMinor - payment.refundedMinor,
      }));

      const gross = rows.reduce((sum, r) => sum + Number(r.amount), 0);
      const refunded = rows.reduce((sum, r) => sum + Number(r.refunded), 0);
      const discounts = rows.reduce((sum, r) => sum + Number(r.discount), 0);

      return {
        ...meta, generatedAt,
        columns: [
          { key: "reference", label: "Reference", type: "text" },
          { key: "date", label: "Paid", type: "date" },
          { key: "course", label: "Course", type: "text" },
          { key: "payer", label: "Payer", type: "text" },
          { key: "provider", label: "Provider", type: "text" },
          { key: "coupon", label: "Coupon", type: "text" },
          { key: "discount", label: "Discount", type: "currency" },
          { key: "amount", label: "Amount", type: "currency" },
          { key: "refunded", label: "Refunded", type: "currency" },
          { key: "net", label: "Net", type: "currency" },
        ],
        rows,
        summary: [
          { label: "Payments", value: String(rows.length) },
          { label: "Gross", value: formatNaira(gross) },
          { label: "Discounts given", value: formatNaira(discounts) },
          { label: "Refunded", value: formatNaira(refunded) },
          { label: "Net", value: formatNaira(gross - refunded) },
        ],
      };
    }

    case "completion": {
      const users = await prisma.user.findMany({
        where: { deletedAt: null, enrollments: { some: {} } },
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true, organizationName: true } },
          organization: { select: { name: true } },
          enrollments: {
            where: { enrolledAt: withinRange(range) },
            select: { status: true, progressPercent: true, completedAt: true },
          },
          certificates: { where: { status: "ISSUED" }, select: { id: true } },
        },
      });

      const rows: ReportRow[] = users
        .filter((user) => user.enrollments.length > 0)
        .map((user) => {
          const total = user.enrollments.length;
          const completed = user.enrollments.filter((e) => e.status === "COMPLETED").length;
          return {
            learner: `${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.trim() || user.email,
            email: user.email,
            organisation: user.organization?.name ?? user.profile?.organizationName ?? "",
            enrolments: total,
            completed,
            averageProgress: Math.round(
              user.enrollments.reduce((sum, e) => sum + e.progressPercent, 0) / total,
            ),
            certificates: user.certificates.length,
          };
        })
        .sort((a, b) => Number(b.completed) - Number(a.completed));

      return {
        ...meta, generatedAt,
        columns: [
          { key: "learner", label: "Learner", type: "text" },
          { key: "email", label: "Email", type: "text" },
          { key: "organisation", label: "Organisation", type: "text" },
          { key: "enrolments", label: "Enrolments", type: "number" },
          { key: "completed", label: "Completed", type: "number" },
          { key: "averageProgress", label: "Avg progress", type: "percent" },
          { key: "certificates", label: "Certificates", type: "number" },
        ],
        rows,
        summary: [
          { label: "Learners", value: String(rows.length) },
          { label: "Certificates issued", value: String(rows.reduce((s, r) => s + Number(r.certificates), 0)) },
        ],
      };
    }

    case "instructors": {
      const instructors = await prisma.user.findMany({
        where: { coursesTaught: { some: {} }, deletedAt: null },
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true } },
          coursesTaught: {
            select: {
              title: true, status: true,
              enrollments: { select: { status: true, progressPercent: true } },
              quizzes: {
                select: {
                  attempts: {
                    where: { status: { in: ["AUTO_GRADED", "GRADED"] } },
                    select: { score: true, maxScore: true },
                  },
                },
              },
            },
          },
        },
      });

      const rows: ReportRow[] = instructors.map((instructor) => {
        const courses = instructor.coursesTaught;
        const enrolments = courses.flatMap((c) => c.enrollments);
        const completed = enrolments.filter((e) => e.status === "COMPLETED").length;
        const attempts = courses.flatMap((c) => c.quizzes.flatMap((q) => q.attempts));
        const points = attempts.reduce((sum, a) => sum + (a.maxScore ?? 0), 0);
        const earned = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);

        return {
          instructor:
            `${instructor.profile?.firstName ?? ""} ${instructor.profile?.lastName ?? ""}`.trim() ||
            instructor.email,
          email: instructor.email,
          courses: courses.length,
          published: courses.filter((c) => c.status === "PUBLISHED").length,
          learners: enrolments.length,
          completions: completed,
          completionRate: enrolments.length === 0 ? 0 : Math.round((completed / enrolments.length) * 100),
          averageQuiz: points === 0 ? 0 : Math.round((earned / points) * 100),
        };
      });

      return {
        ...meta, generatedAt,
        columns: [
          { key: "instructor", label: "Instructor", type: "text" },
          { key: "email", label: "Email", type: "text" },
          { key: "courses", label: "Courses", type: "number" },
          { key: "published", label: "Published", type: "number" },
          { key: "learners", label: "Learners", type: "number" },
          { key: "completions", label: "Completions", type: "number" },
          { key: "completionRate", label: "Completion rate", type: "percent" },
          { key: "averageQuiz", label: "Avg quiz score", type: "percent" },
        ],
        rows,
      };
    }

    case "compliance": {
      const [requests, consents, users] = await Promise.all([
        prisma.dataSubjectRequest.findMany({
          where: { createdAt: withinRange(range) },
          orderBy: { createdAt: "desc" },
          select: {
            type: true, status: true, createdAt: true, handledAt: true, resolution: true,
            user: { select: { email: true } },
          },
        }),
        prisma.consentLog.findMany({
          where: { createdAt: withinRange(range) },
          orderBy: { createdAt: "desc" },
          select: { type: true, action: true, createdAt: true, user: { select: { email: true } } },
        }),
        prisma.user.count({ where: { deletedAt: null } }),
      ]);

      // One table, two record kinds: a compliance officer wants a single
      // chronological view of what was asked and what was consented.
      const rows: ReportRow[] = [
        ...requests.map((request) => ({
          date: request.createdAt,
          kind: "Rights request",
          subject: request.user.email,
          detail: request.type.replaceAll("_", " ").toLowerCase(),
          status: request.status.replaceAll("_", " ").toLowerCase(),
          // Days to resolve is the number a regulator asks for.
          daysToResolve:
            request.handledAt === null
              ? ""
              : Math.max(
                  0,
                  Math.round(
                    (request.handledAt.getTime() - request.createdAt.getTime()) / 86400000,
                  ),
                ),
          outcome: request.resolution ?? "",
        })),
        ...consents.map((consent) => ({
          date: consent.createdAt,
          kind: "Consent",
          subject: consent.user.email,
          detail: consent.type.replaceAll("_", " ").toLowerCase(),
          status: consent.action.toLowerCase(),
          daysToResolve: "",
          outcome: "",
        })),
      ].sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime());

      const open = requests.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS").length;

      return {
        ...meta, generatedAt,
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "kind", label: "Record", type: "text" },
          { key: "subject", label: "Subject", type: "text" },
          { key: "detail", label: "Detail", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "daysToResolve", label: "Days to resolve", type: "text" },
          { key: "outcome", label: "Outcome", type: "text" },
        ],
        rows,
        summary: [
          { label: "Active data subjects", value: String(users) },
          { label: "Rights requests", value: String(requests.length) },
          { label: "Open requests", value: String(open) },
          { label: "Consent events", value: String(consents.length) },
        ],
      };
    }
  }
}

function formatNaira(minor: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
