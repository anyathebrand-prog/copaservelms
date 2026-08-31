import Link from "next/link";
import { LogoLink } from "@/components/layout/logo";
import { AccountNav } from "@/components/landing/account-nav";

/**
 * Public site header.
 *
 * Deliberately reads nothing about the visitor. The account corner is a client
 * component, so every page using this header stays statically renderable and
 * can be cached at the edge — asking the server who the visitor is would make
 * the whole page dynamic for the sake of one link.
 *
 * `dark` is for the landing page, whose hero is a dark band: a white bar
 * floating above it would cut the hero off at the top. It stays dark down the
 * whole page rather than fading in on scroll, because detecting scroll needs
 * client JavaScript in a component that is otherwise free, and a dark bar over
 * light content is a deliberate look rather than a compromise.
 */
export function SiteHeader({ dark = false }: { dark?: boolean }) {
  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur ${
        dark
          ? "border-b border-white/10 bg-brand-ink/70 text-white"
          : "border-b border-border/60 bg-background/80"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <LogoLink height={30} variant={dark ? "white" : "dark"} />

        <nav className="hidden items-center gap-7 text-sm sm:flex">
          <Link
            href="#courses"
            className={`transition ${
              dark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Courses
          </Link>
          <Link
            href="#verify"
            className={`transition ${
              dark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Verify a certificate
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <AccountNav dark={dark} />
        </div>
      </div>
    </header>
  );
}
