import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireUser } from "@/lib/roles";
import { getMyApplication } from "@/lib/instructor-applications";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { applyToTeachAction, withdrawApplicationAction } from "./actions";

export const metadata: Metadata = { title: "Teach on CopaServe" };
export const dynamic = "force-dynamic";

/**
 * Ask to teach (PRD §13.2).
 *
 * The role is granted by an admin, never claimed at signup — a certificate is
 * only worth something because not anyone can issue one. This page is the part
 * that was missing: somewhere to ask, and somewhere to see what happened to
 * the asking.
 */
export default async function TeachPage() {
  const user = await requireUser("/student/teach");
  const application = await getMyApplication(user.id);
  const isInstructor = user.roles.includes("INSTRUCTOR");

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Teach on CopaServe
        </h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          Courses here end in a certificate an employer or regulator can verify, so instructors are
          approved rather than self-declared. Tell us what you would teach and we will come back to
          you.
        </p>
      </header>

      {isInstructor ? (
        <Panel>
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-5" />
            You already teach on CopaServe
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your courses are in the{" "}
            <Link href="/instructor" className="font-medium text-brand hover:underline">
              Teaching area
            </Link>
            , which you can also reach from the switcher at the top of the page.
          </p>
        </Panel>
      ) : application?.status === "PENDING" ? (
        <Panel title="Your application is with us">
          <p className="flex items-center gap-2 text-sm text-warning">
            <Clock className="size-4" />
            Submitted{" "}
            {application.submittedAt.toLocaleDateString("en-NG", { dateStyle: "long" })}
          </p>

          <dl className="mt-5 space-y-4 border-t border-border pt-5 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                What you would teach
              </dt>
              <dd className="mt-1">{application.expertise}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Background</dt>
              <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {application.background}
              </dd>
            </div>
          </dl>

          <form action={withdrawApplicationAction} className="mt-6 border-t border-border pt-5">
            <input type="hidden" name="applicationId" value={application.id} />
            <SubmitButton
              pendingLabel="Withdrawing..."
              className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
            >
              Withdraw my application
            </SubmitButton>
          </form>
        </Panel>
      ) : (
        <>
          {application?.status === "DECLINED" && (
            <Panel>
              <p className="flex items-center gap-2 font-medium text-muted-foreground">
                <XCircle className="size-5" />
                A previous application was not taken forward
              </p>
              {application.decisionNote && (
                <p className="mt-2 rounded-xl bg-surface-muted p-4 text-sm text-muted-foreground">
                  {application.decisionNote}
                </p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                You are welcome to apply again if something has changed.
              </p>
            </Panel>
          )}

          <Panel title="Apply">
            <form action={applyToTeachAction} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">What would you teach?</span>
                <input
                  name="expertise"
                  required
                  maxLength={200}
                  placeholder="Data protection for financial institutions"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Your background in it
                </span>
                <textarea
                  name="background"
                  required
                  rows={5}
                  maxLength={2000}
                  placeholder="Where you have done this work, for how long, and anything that would reassure someone relying on a certificate you signed."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  A link <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <input
                  name="link"
                  type="url"
                  placeholder="https://linkedin.com/in/…"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  Anywhere that corroborates the above — a profile, a publication, a portfolio.
                </span>
              </label>

              <SubmitButton
                pendingLabel="Sending..."
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Send application
              </SubmitButton>
            </form>
          </Panel>
        </>
      )}
    </div>
  );
}
