import Link from "next/link";
import type { Metadata } from "next";
import { unsubscribe } from "@/lib/waitlist";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = { title: "Unsubscribed" };
export const dynamic = "force-dynamic";

/**
 * One click, no sign-in, no confirmation step.
 *
 * Withdrawing consent has to be at least as easy as giving it. Asking someone
 * to log in, or to confirm twice, is friction placed deliberately in the way of
 * a right — which is the thing this platform exists to teach people not to do.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await unsubscribe(token);

  return (
    <>
      <SiteHeader dark />
      <main className="flex-1 bg-surface-muted">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          {result.ok ? (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">You are unsubscribed</h1>
              <p className="mt-4 text-muted-foreground">
                We will not email {result.data.email} about CopaServe again. We keep a record that
                you asked us not to, so a later import cannot put you back.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                That link is not valid
              </h1>
              <p className="mt-4 text-muted-foreground">
                It may already have been used. If you are still receiving email you did not ask
                for, reply to any message and we will remove you by hand.
              </p>
            </>
          )}

          <Link
            href="/"
            className="mt-8 inline-flex rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium transition hover:bg-surface-muted"
          >
            Back to CopaServe
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
