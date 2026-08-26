import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { availableProviders } from "@/lib/payments/provider";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { enrolAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { title: true, subtitle: true },
  });

  return course
    ? { title: course.title, description: course.subtitle ?? undefined }
    : { title: "Course not found" };
}

/**
 * Public course page — the catalogue entry that leads to enrolment.
 *
 * Only published courses resolve here. The curriculum is listed so a buyer can
 * see what they are paying for, but lesson content stays behind enrolment;
 * preview lessons are marked as such.
 */
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      level: true,
      priceMinor: true,
      currency: true,
      estimatedMinutes: true,
      category: { select: { name: true } },
      instructor: {
        select: { profile: { select: { firstName: true, lastName: true, displayName: true, bio: true } } },
      },
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true, title: true, position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, durationSeconds: true, isPreview: true },
          },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course) notFound();

  const user = await getCurrentUser().catch(() => null);
  const enrolled = user
    ? await prisma.enrollment.findFirst({
        where: { userId: user.id, courseId: course.id },
        select: { id: true },
      })
    : null;

  const providers = availableProviders();
  const isFree = course.priceMinor <= 0;
  const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const instructor = course.instructor.profile;

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_320px]">
          <article className="min-w-0">
            <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
              ← All courses
            </Link>

            {course.category && (
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand">
                {course.category.name}
              </p>
            )}
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">{course.title}</h1>
            {course.subtitle && <p className="mt-3 text-lg text-muted-foreground">{course.subtitle}</p>}

            <p className="mt-4 text-sm text-muted-foreground">
              {course.level.toLowerCase()} · {lessonCount} lessons
              {course.estimatedMinutes ? ` · ~${Math.round(course.estimatedMinutes / 60)} hours` : ""} ·{" "}
              {course._count.enrollments} enrolled
            </p>

            {course.description && (
              <section className="mt-8">
                <h2 className="font-display text-xl font-semibold">About this course</h2>
                <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{course.description}</p>
              </section>
            )}

            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold">Curriculum</h2>
              <div className="mt-4 space-y-3">
                {course.modules.map((module) => (
                  <article key={module.id} className="rounded-2xl border border-border bg-surface">
                    <header className="border-b border-border px-5 py-3">
                      <h3 className="font-medium">
                        <span className="text-muted-foreground">{module.position}.</span> {module.title}
                      </h3>
                    </header>
                    <ul className="divide-y divide-border">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                          <span className="truncate text-sm">{lesson.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {lesson.isPreview && (
                              <span className="mr-2 rounded-full bg-brand-pale px-2 py-0.5 font-semibold text-brand">
                                preview
                              </span>
                            )}
                            {lesson.durationSeconds ? `${Math.round(lesson.durationSeconds / 60)} min` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            {instructor && (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold">Your instructor</h2>
                <p className="mt-2 font-medium">
                  {instructor.displayName?.trim() || `${instructor.firstName} ${instructor.lastName}`}
                </p>
                {instructor.bio && <p className="mt-1 text-sm text-muted-foreground">{instructor.bio}</p>}
              </section>
            )}
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <p className="font-display text-3xl font-bold">
                {isFree
                  ? "Free"
                  : new Intl.NumberFormat("en-NG", {
                      style: "currency",
                      currency: course.currency,
                      maximumFractionDigits: 0,
                    }).format(course.priceMinor / 100)}
              </p>

              {enrolled ? (
                <Link
                  href={`/student/courses/${slug}`}
                  className="mt-4 block rounded-lg bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:brightness-110"
                >
                  Continue learning
                </Link>
              ) : isFree ? (
                <form action={enrolAction} className="mt-4">
                  <input type="hidden" name="courseId" value={course.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Enrol for free
                  </button>
                </form>
              ) : providers.length === 0 ? (
                // Better an honest message than a button that fails on click.
                <p className="mt-4 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
                  Payments are not yet available for this course. Please check back shortly.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {providers.map((provider) => (
                    <form key={provider} action={enrolAction} className="space-y-2">
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="provider" value={provider} />
                      {/* The code travels with the checkout request and is
                          priced server-side; nothing here computes a total. */}
                      <input
                        name="couponCode"
                        placeholder="Discount code (optional)"
                        aria-label="Discount code"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm uppercase outline-none transition focus:border-brand"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Pay with {provider.charAt(0) + provider.slice(1).toLowerCase()}
                      </button>
                    </form>
                  ))}
                </div>
              )}

              <ul className="mt-6 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <li>✓ Lifetime access to course materials</li>
                <li>✓ Verifiable certificate on completion</li>
                <li>✓ Optional on-chain credential</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
