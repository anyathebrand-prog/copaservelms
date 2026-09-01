import Link from "next/link";
import { Award, ArrowRight, ClipboardCheck, PartyPopper } from "lucide-react";

/**
 * What happens when the last lesson is done.
 *
 * This exists because finishing a course was a dead end: the final lesson
 * showed "Completed ✓" and a Previous button, and nothing said the course was
 * over, that a certificate had been earned, or that a quiz was waiting. The
 * database knew all three. The learner was the only party not told.
 *
 * The order below is the order of what to do next, not of what is most
 * impressive: an outstanding quiz comes before the certificate, because the
 * certificate is the reward and the quiz is the remaining work.
 */
export function CourseComplete({
  slug,
  courseTitle,
  quizzes,
  certificate,
}: {
  slug: string;
  courseTitle: string;
  /** Quizzes on this course the learner has not passed yet. */
  quizzes: { id: string; title: string }[];
  certificate: { id: string; credentialId: string; status: string } | null;
}) {
  const issued = certificate !== null && certificate.status !== "REVOKED";

  return (
    <section className="hero-ink grain relative overflow-hidden rounded-3xl p-7 text-white">
      <div
        aria-hidden
        className="absolute -right-16 -top-16 size-56 rounded-full bg-brand-bright/15 blur-3xl"
      />

      <div className="relative">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-bright/15">
          <PartyPopper className="size-5 text-brand-bright" />
        </span>

        <h2 className="mt-4 font-display text-2xl font-bold">You have finished the course</h2>
        <p className="mt-2 text-sm text-white/60">
          Every lesson in {courseTitle} is complete.
        </p>

        <div className="mt-7 space-y-3">
          {quizzes.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="size-4 text-brand-bright" />
                {quizzes.length === 1
                  ? "One quiz still to take"
                  : `${quizzes.length} quizzes still to take`}
              </p>
              <p className="mt-1 text-sm text-white/50">
                {issued
                  ? "Not required for your certificate, but worth doing."
                  : "Your certificate is issued once these are passed."}
              </p>

              <ul className="mt-4 space-y-2">
                {quizzes.map((quiz) => (
                  <li key={quiz.id}>
                    <Link
                      href={`/student/quizzes/${quiz.id}`}
                      className="group flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10"
                    >
                      {quiz.title}
                      <ArrowRight className="size-4 shrink-0 text-brand-bright transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {issued ? (
            <Link
              href="/student/certificates"
              className="group flex items-center justify-between gap-4 rounded-2xl bg-brand-bright px-6 py-5 text-brand-ink transition hover:brightness-110"
            >
              <span>
                <span className="flex items-center gap-2 font-display text-lg font-bold">
                  <Award className="size-5" />
                  Your certificate is ready
                </span>
                <span className="mt-0.5 block font-mono text-xs opacity-70">
                  {certificate.credentialId}
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            quizzes.length === 0 && (
              // Eligible but unissued means a person has to approve it, which
              // is a wait rather than a failure — so say which it is.
              <p className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60">
                Your certificate is being prepared. It will appear under{" "}
                <Link href="/student/certificates" className="font-semibold text-brand-bright hover:underline">
                  Certificates
                </Link>{" "}
                once it has been approved.
              </p>
            )
          )}

          <Link
            href={`/student/courses/${slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/60 transition hover:text-white"
          >
            Back to the course
          </Link>
        </div>
      </div>
    </section>
  );
}
