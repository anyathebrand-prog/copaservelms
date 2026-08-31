"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type NavGroup } from "@/components/layout/nav-config";

/**
 * The ink sidebar (PRD §6.3 "collapsible sidebar on desktop/tablet").
 *
 * Dark, so the shell reads as one continuous frame with the top bar and the
 * work sits in the light area inside it. The active item is marked by a lit
 * green rail rather than a filled block: on ink, a filled pill is a hole in
 * the sidebar, while a rail reads as a marker.
 */
export function PortalNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="space-y-7">
      {groups.map((group, index) => (
        <div key={group.label ?? `group-${index}`}>
          {group.label && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
              {group.label}
            </p>
          )}

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href, pathname);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/55 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-bright shadow-[0_0_12px_rgba(5,255,18,0.8)]"
                      />
                    )}
                    <Icon
                      className={`size-4 shrink-0 transition ${
                        active ? "text-brand-bright" : "text-white/40 group-hover:text-white/70"
                      }`}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
