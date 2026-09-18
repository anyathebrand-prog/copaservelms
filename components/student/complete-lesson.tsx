"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, Check } from "lucide-react";

/**
 * "Mark as complete", for a connection that may not be there.
 *
 * The failure this exists for is specific: a learner finishes a lesson on
 * mobile data, taps the button, the request dies, and the lesson stays
 * unfinished. The lesson was still watched. Losing that is the platform's
 * fault, not theirs, and it is the kind of thing that makes someone stop
 * trusting a progress bar.
 *
 * So the tap is recorded either way. Online it goes straight to the endpoint;
 * offline — or when the request fails, which is the more common case, since a
 * phone on a weak signal reports itself online while nothing gets through — it
 * is written to IndexedDB and replayed when the connection returns.
 *
 * Progressive enhancement, deliberately: the surrounding form still posts to
 * the server action, so with JavaScript unavailable or still downloading the
 * button behaves exactly as it did before. This only takes over once it can
 * offer something better.
 */
type Props = {
  lessonId: string;
  userId: string;
  completed: boolean;
};

type State = "idle" | "saving" | "done" | "queued";

export function CompleteLesson({ lessonId, userId, completed }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>(completed ? "done" : "idle");
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  // Start the queue and drain anything left from a previous visit. Imported
  // here rather than at the top of the file because the engine touches
  // IndexedDB and Web Locks, neither of which exists on the server.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    import("@/lib/flux/client")
      .then(async (flux) => {
        if (cancelled) return;
        readyRef.current = true;
        setReady(true);
        stop = flux.startReplay(userId);

        const count = await flux.pendingCount(userId);
        if (!cancelled) setPending(count);
      })
      .catch((cause) => {
        // Flux failing to load must not cost the learner the button: the form
        // still posts to the server action underneath.
        console.warn("[flux] offline queue unavailable", cause);
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [userId]);

  async function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!readyRef.current || completed) return; // let the plain form submit
    event.preventDefault();

    setState("saving");

    try {
      const response = await fetch("/api/progress/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });

      if (response.ok) {
        const body = (await response.json()) as { nextQuizId?: string | null; certificate?: unknown };
        setState("done");

        // Same destinations the server action chooses, so the two paths do not
        // disagree about what finishing a course means.
        if (body.nextQuizId) router.push(`/student/quizzes/${body.nextQuizId}`);
        else if (body.certificate) router.push("/student/certificates");
        else router.refresh();
        return;
      }

      // A refusal is not a network problem. Queueing a lesson the server says
      // does not exist, or that this learner is not enrolled in, would replay
      // for ever.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        setState("idle");
        return;
      }

      throw new Error(`server said ${response.status}`);
    } catch {
      const flux = await import("@/lib/flux/client");
      await flux.queueLessonCompletion(lessonId, userId);
      setState("queued");
      setPending(await flux.pendingCount(userId));
    }
  }

  const label =
    state === "saving" ? "Saving…"
    : state === "done" ? "Completed ✓"
    : state === "queued" ? "Saved on this device"
    : "Mark as complete";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        onClick={onClick}
        // Observable readiness: until the queue has loaded this button is an
        // ordinary form submit, and a test that clicks before then is testing
        // the fallback. Also honest in the DOM about which path is live.
        data-offline-ready={ready ? "true" : "false"}
        disabled={state === "saving" || state === "done"}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {label}
      </button>

      {state === "queued" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <CloudOff className="size-3.5" />
          Saved here — it will reach your record when you are back online.
        </p>
      )}

      {state !== "queued" && pending > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Check className="size-3.5" />
          {pending} {pending === 1 ? "lesson" : "lessons"} waiting to sync.
        </p>
      )}
    </div>
  );
}
