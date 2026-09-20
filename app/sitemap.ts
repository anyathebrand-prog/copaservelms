import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

/**
 * /sitemap.xml
 *
 * Generated rather than written by hand, so a course published today is in it
 * without anyone remembering to add it — and so a course that is unpublished
 * or deleted leaves it the same way.
 *
 * Only pages worth someone landing on from a search: the public ones, plus
 * every published course. Nothing behind a sign-in, nothing personalised, and
 * not /verify/<credential>, which is one page per certificate and exists for
 * the person holding the id, not for search engines.
 */
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.copaserve.com.ng").replace(/\/$/, "");

// Rebuilt hourly, so publishing a course does not wait for the next deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/courses`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/teach`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/verify`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const courses = await prisma.course.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5_000,
    });

    for (const course of courses) {
      pages.push({
        url: `${BASE}/courses/${course.slug}`,
        lastModified: course.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (cause) {
    // A database hiccup should cost the course list, not the whole sitemap:
    // returning the public pages beats returning a 500 to a crawler.
    console.error("[sitemap] could not list courses", cause);
  }

  return pages;
}
