"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Switch between the portals a person is entitled to.
 *
 * Roles accumulate: everyone gets STUDENT at signup, so an instructor or admin
 * is always also a learner. Without this there is no route from one area to
 * another except typing a URL, which is how three quite different dashboards
 * came to look like one.
 *
 * Only areas the person actually holds are shown, so this reveals nothing —
 * every destination is separately guarded by requireRole.
 */
type Area = { href: string; label: string };

export function AreaSwitcher({ roles }: { roles: string[] }) {
  const pathname = usePathname();

  const areas: Area[] = [];
  if (roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) {
    areas.push({ href: "/admin", label: "Admin" });
  }
  if (roles.includes("INSTRUCTOR")) {
    areas.push({ href: "/instructor", label: "Instructor" });
  }
  areas.push({ href: "/student", label: "Learning" });

  // One area means nothing to switch between, and a lone button implying
  // otherwise is just noise.
  if (areas.length < 2) return null;

  return (
    <nav
      aria-label="Switch area"
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1"
    >
      {areas.map((area) => {
        const active =
          area.href === "/student"
            ? pathname.startsWith("/student")
            : pathname.startsWith(area.href);

        return (
          <Link
            key={area.href}
            href={area.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active ? "bg-brand-bright text-brand-ink" : "text-white/55 hover:text-white"
            }`}
          >
            {area.label}
          </Link>
        );
      })}
    </nav>
  );
}
