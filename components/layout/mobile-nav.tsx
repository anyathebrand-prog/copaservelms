"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { isActive, type NavGroup } from "@/components/layout/nav-config";

/**
 * Bottom navigation for phones (PRD §6.3 "bottom nav on mobile").
 *
 * This existed nowhere before. The sidebar was `hidden sm:block` with nothing
 * behind it, so on a phone a signed-in person could reach the page they landed
 * on and no other — a dead end, not a small styling gap.
 *
 * The bar carries the few destinations marked primary; More opens the full
 * grouped list. Splitting it that way keeps the bar readable at thumb size
 * without hiding anything: everything in the sidebar is still reachable here.
 */
export function MobileNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const primary = groups.flatMap((group) => group.items.filter((item) => item.primary)).slice(0, 4);

  // A sheet that scrolls the page behind it feels broken on touch.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="hero-ink absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 pb-24 text-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-brand-ink/80 px-5 py-4 backdrop-blur">
              <p className="font-display font-semibold">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-full border border-white/15 p-2 transition hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav aria-label={label} className="space-y-6 px-5 py-5">
              {groups.map((group, index) => (
                <div key={group.label ?? `group-${index}`}>
                  {group.label && (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                      {group.label}
                    </p>
                  )}
                  <ul className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const active = isActive(item.href, pathname);
                      const Icon = item.icon;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm transition ${
                              active
                                ? "border-brand-bright/40 bg-white/10 font-semibold text-white"
                                : "border-white/10 text-white/70"
                            }`}
                          >
                            <Icon
                              className={`size-4 shrink-0 ${
                                active ? "text-brand-bright" : "text-white/40"
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
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-brand-ink/95 backdrop-blur lg:hidden">
        {/* Padded for the home indicator, so the last row is not sitting under it. */}
        <div className="mx-auto flex max-w-lg items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => {
            const active = isActive(item.href, pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition ${
                  active ? "text-brand-bright" : "text-white/50"
                }`}
              >
                <Icon className="size-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium text-white/50 transition"
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </div>
    </>
  );
}
