import type { MetadataRoute } from "next";

/**
 * /robots.txt
 *
 * Points crawlers at the sitemap, and keeps them out of everything that is
 * either private or pointless to index.
 *
 * This is not a security control — anything genuinely private is protected by
 * the session, not by asking politely. It is here so that signed-in areas do
 * not end up in search results as sign-in redirects, and so crawlers do not
 * spend their time on per-certificate verification pages.
 */
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.copaserve.com.ng").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/student/",
          "/instructor/",
          "/admin/",
          "/portal",
          "/api/",
          "/auth/",
          "/payments/",
          "/login",
          "/signup?",
          "/reset-password",
          "/forgot-password",
          "/two-factor",
          // One page per certificate, for whoever holds the id.
          "/verify/",
          "/offline",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
