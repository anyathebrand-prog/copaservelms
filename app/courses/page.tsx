import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Courses" };
export const revalidate = 300;

/** Public catalogue. Only published courses appear. */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const [courses, categories] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED", ...(category ? { category: { slug: category } } : {}) },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      select: {
        id: true, title: true, slug: true, subtitle: true, level: true,
        priceMinor: true, currency: true, estimatedMinutes: true,
        category: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <header>
            <h1 className="font-display text-4xl font-bold tracking-tight">Courses</h1>
            <p className="mt-2 text-muted-foreground">
              Professional certification in data protection, governance, and compliance.
            </p>
          </header>

          <nav className="mt-8 flex flex-wrap gap-2">
            <Link
              href="/courses"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                !category ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
              }`}
            >
              All
            </Link>
            {categories.map((item) => (
              <Link
                key={item.slug}
                href={`/courses?category=${item.slug}`}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  category === item.slug ? "bg-brand text-white" : "border border-border hover:bg-surface-muted"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {courses.length === 0 ? (
            <p className="mt-10 rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No published courses in this category yet.
            </p>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.slug}`} className="block">
                  <Card className="flex h-full flex-col">
                    {course.category && (
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                        {course.category.name}
                      </p>
                    )}
                    <h2 className="mt-2 font-display text-lg font-semibold">{course.title}</h2>
                    {course.subtitle && (
                      <p className="mt-2 flex-1 text-sm text-muted-foreground">{course.subtitle}</p>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
                      <span className="text-muted-foreground">
                        {course.level.toLowerCase()}
                        {course.estimatedMinutes ? ` · ${Math.round(course.estimatedMinutes / 60)}h` : ""}
                      </span>
                      <span className="font-semibold">
                        {course.priceMinor === 0
                          ? "Free"
                          : new Intl.NumberFormat("en-NG", {
                              style: "currency", currency: course.currency, maximumFractionDigits: 0,
                            }).format(course.priceMinor / 100)}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
