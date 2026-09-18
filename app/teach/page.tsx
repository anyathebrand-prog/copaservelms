import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Clock, Users, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getMyApplication } from "@/lib/instructor-applications";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { SubmitButton } from "@/components/ui/submit-button";
import { applyToTeachAction, withdrawApplicationAction } from "./actions";

export const metadata: Metadata = {
  title: "Teach on CopaServe",
  description:
    "Teach data protection, compliance, cybersecurity or governance to professionals, with certificates employers can verify.",
};

// Personalised for anyone signed in: it shows their own application.
export const dynamic = "force-dynamic";

/**
 * Ask to teach (PRD §13.2).
 *
 * Public, because the people this is for are not learners yet. It lived inside
 * the student area, which meant a practitioner who wanted to teach had to
 * create a learner account and go looking for it in a sidebar before they
 * could find out whether they were even welcome — the page existed, and almost
 * nobody who should have seen it could.
 *
 * Applying still needs an account: the instructor role is granted to a person,
 * by an admin, never claimed at signup, because a certificate is only worth
 * something if not anyone can issue one. So signed out, this page explains and
 * sends people to create an account and come straight back here; signed in, it
 * is the form, or the state of what they already sent.
 */
const REASONS = [
  {
    icon: Users,
    title: "Professionals who need what you know",
    body: "Compliance officers, DPOs, IT and risk teams — people learning because their job or their regulator requires it.",
  },
  {
    icon: BadgeCheck,
    title: "Certificates that mean something",
    body: "Every certificate carries a credential anyone can check, so what your learners earn holds up with an employer.",
  },
  // Deliberately says nothing about instructor pay: there is no payout or
  // revenue share in the platform, and a public page must not promise one.
  {
    icon: BookOpen,
    title: "Your course, built your way",
    body: "Lessons, quizzes and assignments in one place. Set the price or run it free — we handle enrolment, payment and the certificate.",
  },
];

export default async function TeachPage() {
  const user = await getCurrentUser();
  const application = user ? await getMyApplication(user.id) : null;
  const isInstructor = user?.roles.includes("INSTRUCTOR") ?? false;

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            For practitioners
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Teach what you know,
            <span className="block text-muted-foreground">to people who need it.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Instructors on CopaServe are approved, not self-declared — that is what makes the
            certificates worth having. Tell us what you would teach and we will come back to you.
          </p>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0 rounded-3xl border border-border bg-surface p-6 sm:p-8">
              {!user ? (
                <SignedOut />
              ) : isInstructor ? (
                <AlreadyTeaching />
              ) : application?.status === "PENDING" ? (
                <Pending application={application} />
              ) : (
                <ApplyForm declined={application?.status === "DECLINED" ? application : null} />
              )}
            </div>

            <aside className="min-w-0 space-y-6">
              {REASONS.map((reason) => (
                <div key={reason.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-pale">
                    <reason.icon className="size-5 text-brand" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{reason.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{reason.body}</p>
                  </div>
                </div>
              ))}
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * Not signed in. The account comes first because the role is granted to a
 * person, and ?next=/teach brings them straight back here afterwards rather
 * than dropping them at a learner dashboard to find their way back.
 */
function SignedOut() {
  return (
    <div>
      <h2 className="font-display text-xl font-bold">Apply to teach</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        You will need a CopaServe account to apply, so we know who to come back to. It takes a
        minute, and you will land straight back here to send your application.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/signup?next=/teach"
          className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Create an account to apply
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/login?next=/teach"
          className="inline-flex items-center rounded-xl border border-border px-6 py-3.5 text-sm font-medium transition hover:bg-surface-muted"
        >
          I already have an account
        </Link>
      </div>
    </div>
  );
}

function AlreadyTeaching() {
  return (
    <div>
      <p className="flex items-center gap-2 font-medium text-success">
        <CheckCircle2 className="size-5" />
        You already teach on CopaServe
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Your courses are in the{" "}
        <Link href="/instructor" className="font-medium text-brand hover:underline">
          Teaching area
        </Link>
        .
      </p>
    </div>
  );
}

type Application = NonNullable<Awaited<ReturnType<typeof getMyApplication>>>;

function Pending({ application }: { application: Application }) {
  return (
    <div>
      <h2 className="font-display text-xl font-bold">Your application is with us</h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-warning">
        <Clock className="size-4" />
        Submitted {application.submittedAt.toLocaleDateString("en-NG", { dateStyle: "long" })}
      </p>

      <dl className="mt-5 space-y-4 border-t border-border pt-5 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">What you would teach</dt>
          <dd className="mt-1">{application.expertise}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Background</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
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
    </div>
  );
}

function ApplyForm({ declined }: { declined: Application | null }) {
  const field =
    "w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand";

  return (
    <div className="space-y-6">
      {declined && (
        <div className="rounded-2xl bg-surface-muted p-5">
          <p className="flex items-center gap-2 font-medium text-muted-foreground">
            <XCircle className="size-5" />A previous application was not taken forward
          </p>
          {declined.decisionNote && (
            <p className="mt-2 text-sm text-muted-foreground">{declined.decisionNote}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            You are welcome to apply again if something has changed.
          </p>
        </div>
      )}

      <h2 className="font-display text-xl font-bold">Apply to teach</h2>

      <form action={applyToTeachAction} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">What would you teach?</span>
          <input
            name="expertise"
            required
            maxLength={200}
            placeholder="Data protection for financial institutions"
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Your background in it</span>
          <textarea
            name="background"
            required
            rows={5}
            maxLength={2000}
            placeholder="Where you have done this work, for how long, and anything that would reassure someone relying on a certificate you signed."
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            A link <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input name="link" type="url" placeholder="https://linkedin.com/in/…" className={field} />
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
    </div>
  );
}
