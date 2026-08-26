import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { createCourseAction } from "../../actions";

export const metadata: Metadata = { title: "New course" };

/**
 * Course creation.
 *
 * Deliberately minimal — title, category, level. Everything else is edited in
 * the builder, so an instructor is not made to fill a long form before they
 * can see anything.
 */
export default async function NewCoursePage() {
  await requireRole(["INSTRUCTOR", "ADMIN", "SUPER_ADMIN"], "/instructor/courses/new");
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <Link href="/instructor" className="text-sm text-muted-foreground hover:text-foreground">
          ← Courses
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">New course</h1>
      </header>

      <form action={createCourseAction} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            placeholder="e.g. NDPA Foundations"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Category</span>
          <select
            name="categoryId"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Level</span>
          <select
            name="level"
            defaultValue="BEGINNER"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
          >
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </label>

        <p className="text-xs text-muted-foreground">
          The course is created as a draft. It becomes visible to students only after an admin
          approves and publishes it.
        </p>

        <button
          type="submit"
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Create draft
        </button>
      </form>
    </div>
  );
}
