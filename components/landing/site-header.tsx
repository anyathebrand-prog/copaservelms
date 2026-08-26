import Link from "next/link";
import { LogoLink } from "@/components/layout/logo";
import { getCurrentUser } from "@/lib/auth";
import { dashboardPathFor } from "@/lib/roles";

export async function SiteHeader() {
  // Public page, so an unauthenticated visitor is the normal case, not an error.
  const user = await getCurrentUser().catch(() => null);

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
          {user ? (
            <Link
              href={dashboardPathFor(user)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium transition hover:text-brand">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Start Learning
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
