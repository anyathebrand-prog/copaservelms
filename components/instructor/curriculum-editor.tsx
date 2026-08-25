import {
  addLessonAction,
  addModuleAction,
  deleteLessonAction,
  deleteModuleAction,
  moveLessonAction,
  moveModuleAction,
  updateLessonAction,
} from "@/app/(portal)/instructor/actions";

/**
 * Curriculum builder (PRD §10.3).
 *
 * Reordering uses explicit move up/down controls rather than drag-and-drop.
 * That is a deliberate trade: these are plain form posts, so the editor works
 * without JavaScript and is operable by keyboard and screen reader — which
 * drag-and-drop is not, without a great deal more work. Pointer dragging can
 * be layered on top of the same actions later.
 *
 * The whole editor is server-rendered; each control is its own form, so a
 * failure in one row cannot discard edits in another.
 */
type Lesson = {
  id: string;
  title: string;
  type: string;
  position: number;
  durationSeconds: number | null;
  isPreview: boolean;
  contentUrl: string | null;
  content: string | null;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: Lesson[];
};

const LESSON_TYPES = [
  "VIDEO",
  "PDF",
  "AUDIO",
  "TEXT",
  "EXTERNAL_LINK",
  "EMBEDDED_SLIDES",
  "CODE_SNIPPET",
];

export function CurriculumEditor({
  courseId,
  modules,
  locked,
}: {
  courseId: string;
  modules: Module[];
  locked: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Curriculum</h2>
        <span className="text-sm text-muted-foreground">
          {modules.reduce((sum, m) => sum + m.lessons.length, 0)} lessons
        </span>
      </div>

      {locked && (
        <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
          This course is under review or live. Withdraw it to draft to change the curriculum.
        </p>
      )}

      {modules.map((module, index) => (
        <article key={module.id} className="rounded-2xl border border-border bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h3 className="font-medium">
              <span className="text-muted-foreground">{module.position}.</span> {module.title}
            </h3>

            {!locked && (
              <div className="flex items-center gap-1">
                <MoveButton action={moveModuleAction} name="moduleId" id={module.id} direction="up" disabled={index === 0} label="Move module up" />
                <MoveButton action={moveModuleAction} name="moduleId" id={module.id} direction="down" disabled={index === modules.length - 1} label="Move module down" />
                <form action={deleteModuleAction}>
                  <input type="hidden" name="moduleId" value={module.id} />
                  <button
                    type="submit"
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                  >
                    Delete
                  </button>
                </form>
              </div>
            )}
          </header>

          <ul className="divide-y divide-border">
            {module.lessons.map((lesson, lessonIndex) => (
              <li key={lesson.id} className="px-5 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">{lesson.position}</span>
                      <span className="truncate text-sm">{lesson.title}</span>
                      {lesson.isPreview && (
                        <span className="rounded-full bg-brand-pale px-2 py-0.5 text-[10px] font-semibold text-brand">
                          preview
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                      {lesson.type.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </summary>

                  <div className="mt-4 space-y-3">
                    <form action={updateLessonAction} className="space-y-3">
                      <input type="hidden" name="lessonId" value={lesson.id} />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Title" name="title" defaultValue={lesson.title} required disabled={locked} />
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium">Type</span>
                          <select
                            name="type"
                            defaultValue={lesson.type}
                            disabled={locked}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
                          >
                            {LESSON_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type.toLowerCase().replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <Field
                        label="Content URL"
                        name="contentUrl"
                        defaultValue={lesson.contentUrl ?? ""}
                        placeholder="https://…"
                        disabled={locked}
                      />

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium">Body</span>
                        <textarea
                          name="content"
                          rows={4}
                          defaultValue={lesson.content ?? ""}
                          disabled={locked}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
                        />
                      </label>

                      <div className="flex flex-wrap items-end gap-4">
                        <Field
                          label="Duration (minutes)"
                          name="durationMinutes"
                          type="number"
                          min="0"
                          defaultValue={lesson.durationSeconds ? Math.round(lesson.durationSeconds / 60) : ""}
                          disabled={locked}
                          className="w-40"
                        />
                        <label className="flex items-center gap-2 pb-2 text-sm">
                          <input
                            type="checkbox"
                            name="isPreview"
                            defaultChecked={lesson.isPreview}
                            disabled={locked}
                            className="accent-[var(--brand-green)]"
                          />
                          Free preview
                        </label>

                        <button
                          type="submit"
                          disabled={locked}
                          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                          Save lesson
                        </button>
                      </div>
                    </form>

                    {!locked && (
                      <div className="flex items-center gap-1 border-t border-border pt-3">
                        <MoveButton action={moveLessonAction} name="lessonId" id={lesson.id} direction="up" disabled={lessonIndex === 0} label="Move lesson up" />
                        <MoveButton action={moveLessonAction} name="lessonId" id={lesson.id} direction="down" disabled={lessonIndex === module.lessons.length - 1} label="Move lesson down" />
                        <form action={deleteLessonAction}>
                          <input type="hidden" name="lessonId" value={lesson.id} />
                          <button
                            type="submit"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                          >
                            Delete lesson
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}

            {module.lessons.length === 0 && (
              <li className="px-5 py-4 text-sm text-muted-foreground">No lessons yet.</li>
            )}
          </ul>

          {!locked && (
            <form action={addLessonAction} className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4">
              <input type="hidden" name="moduleId" value={module.id} />
              <Field label="New lesson" name="title" required placeholder="Lesson title" className="min-w-48 flex-1" />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Type</span>
                <select
                  name="type"
                  defaultValue="TEXT"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
                >
                  {LESSON_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.toLowerCase().replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
              >
                Add lesson
              </button>
            </form>
          )}
        </article>
      ))}

      {!locked && (
        <form action={addModuleAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-border p-5">
          <input type="hidden" name="courseId" value={courseId} />
          <Field label="New module" name="title" required placeholder="Module title" className="min-w-48 flex-1" />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Add module
          </button>
        </form>
      )}
    </section>
  );
}

function MoveButton({
  action,
  name,
  id,
  direction,
  disabled,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  id: string;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name={name} value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface-muted disabled:opacity-30"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

function Field({
  label,
  className = "",
  ...rest
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...rest}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
      />
    </label>
  );
}
