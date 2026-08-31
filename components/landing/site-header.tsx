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
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <LogoLink height={30} />

        <nav className="hidden items-center gap-6 text-sm sm:flex">
          <Link href="#courses" className="text-muted-foreground transition hover:text-foreground">
            Courses
          </Link>
          <Link href="#verify" className="text-muted-foreground transition hover:text-foreground">
            Verify a certificate
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <AccountNav />
        </div>
      </div>
    </header>
  );
}
