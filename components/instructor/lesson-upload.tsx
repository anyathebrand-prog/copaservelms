"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  attachLessonUploadAction,
  prepareLessonUploadAction,
  removeLessonUploadAction,
} from "@/app/(portal)/instructor/actions";

/**
 * Upload a lesson's video, PDF or audio.
 *
 * The file goes from the browser straight to storage, never through the
 * server: the server signs a URL for one key, the browser PUTs the file there,
 * and the server is then asked to attach what arrived. Sent that way, a large
 * video is not limited by what a server action will accept, and the progress
 * bar reflects bytes actually leaving the machine rather than a spinner.
 *
 * XMLHttpRequest rather than fetch, for one reason: fetch still cannot report
 * upload progress, and a silent multi-minute upload on a Nigerian mobile
 * connection looks exactly like a hung page.
 */

/** Windows frequently reports no type for .m4a, .mov and friends. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  weba: "audio/webm",
  ogg: "audio/ogg",
};

function typeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? "";
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

type State =
  | { phase: "idle" }
  | { phase: "uploading"; name: string; sent: number; total: number }
  | { phase: "saving"; name: string }
  | { phase: "error"; message: string };

function put(url: string, file: File, contentType: string, onProgress: (sent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Storage's own limit is the one that counts; say so in plain words
      // rather than passing its JSON through.
      const tooLarge = xhr.status === 413 || /maximum allowed size/i.test(xhr.responseText);
      reject(new Error(tooLarge ? "That file is larger than storage accepts." : "The upload was refused. Please try again."));
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload. Please try again."));
    xhr.send(file);
  });
}

export function LessonUpload({
  lessonId,
  accept,
  maxBytes,
  current,
  hint,
}: {
  lessonId: string;
  accept: string;
  maxBytes: number;
  /** The file already on this lesson, if one was uploaded. */
  current: { name: string; viewHref: string } | null;
  /** A line of guidance under the limit, when there is a better route. */
  hint?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const busy = state.phase === "uploading" || state.phase === "saving";

  // Leaving mid-upload throws the upload away, and the browser gives no other
  // hint that anything was in progress.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function upload(file: File) {
    const contentType = typeOf(file);
    if (file.size > maxBytes) {
      setState({ phase: "error", message: `That file is ${megabytes(file.size)} — the limit is ${megabytes(maxBytes)}.` });
      return;
    }

    setState({ phase: "uploading", name: file.name, sent: 0, total: file.size });

    try {
      const signed = await prepareLessonUploadAction(lessonId, {
        name: file.name,
        type: contentType,
        size: file.size,
      });
      if (!signed.ok) throw new Error(signed.message);

      await put(signed.url, file, contentType, (sent) =>
        setState({ phase: "uploading", name: file.name, sent, total: file.size }),
      );

      setState({ phase: "saving", name: file.name });
      const attached = await attachLessonUploadAction(lessonId, signed.key);
      if (!attached.ok) throw new Error(attached.message);

      setState({ phase: "idle" });
      router.refresh();
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "The upload failed." });
    } finally {
      // Choosing the same file again should upload it again.
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("Remove this file from the lesson? It will be deleted.")) return;
    setState({ phase: "saving", name: current?.name ?? "" });
    const result = await removeLessonUploadAction(lessonId);
    if (!result.ok) {
      setState({ phase: "error", message: result.message });
      return;
    }
    setState({ phase: "idle" });
    router.refresh();
  }

  const percent = state.phase === "uploading" && state.total > 0 ? Math.round((state.sent / state.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{current ? "Uploaded file" : "Upload a file"}</p>
          {current ? (
            <p className="truncate text-sm text-muted-foreground">
              {current.name} ·{" "}
              <a href={current.viewHref} target="_blank" rel="noopener" className="font-medium text-brand hover:underline">
                View
              </a>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              PDF, video (MP4, WebM, MOV) or audio · up to {megabytes(maxBytes)}
              {hint && <span className="block">{hint}</span>}
            </p>
          )}
        </div>

        <label
          className={`cursor-pointer rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:bg-surface-muted ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {current ? "Replace" : "Choose file"}
          <input
            ref={input}
            type="file"
            accept={accept}
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>

        {current && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {state.phase === "uploading" && (
        <div className="mt-3 space-y-1" aria-live="polite">
          <progress value={state.sent} max={state.total} className="h-2 w-full accent-[var(--brand-green)]" aria-label={`Uploading ${state.name}`} />
          <p className="text-xs text-muted-foreground">
            Uploading {state.name} — {percent}% of {megabytes(state.total)}. Keep this page open.
          </p>
        </div>
      )}
      {state.phase === "saving" && (
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          Saving…
        </p>
      )}
      {state.phase === "error" && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
