"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { MARK_VIEW_BOX, SLAB_DOWN, SLAB_UP } from "@/components/brand/mark";

/**
 * Cruise, in the corner.
 *
 * Closed by default and never opens itself. A panel that appears uninvited
 * over a lesson is an interruption, and the people using this platform are
 * usually mid-sentence in something they are trying to learn.
 *
 * The conversation lives here and nowhere else — the server keeps nothing, so
 * closing the tab ends it. Said plainly in the panel rather than left for
 * someone to assume either way.
 */
const GREETING =
  "I can answer questions about courses and certificates — and if a payment or a certificate " +
  "has not come through, I can usually sort it out from here. What do you need?";

/**
 * The openers name the two problems people actually arrive with, rather than
 * the two that are easiest to answer. Somebody who has paid and cannot open
 * their course does not think to ask an assistant about it; saying so up front
 * is what turns Cruise from a FAQ into support.
 */
const SUGGESTIONS = [
  "I paid but can't open my course",
  "Why haven't I got my certificate?",
  "What am I enrolled in?",
];

type Message = { role: "user" | "assistant"; content: string };

export function CruiseWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the reply as it is written, but only while the panel is open.
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes it, which is what everyone tries first.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setError(null);
    setDraft("");

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setPending(true);

    try {
      const response = await fetch("/api/cruise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Cruise could not answer that.");
        return;
      }

      // An empty assistant turn goes in first, then grows — so the reply
      // appears as it is written rather than arriving in one lump.
      setMessages([...next, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        answer += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: answer }]);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Cruise, the CopaServe assistant"
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 lg:bottom-6 lg:right-6"
      >
        <MessageCircle className="size-4" />
        Cruise
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Cruise"
      className="fixed inset-x-3 bottom-20 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[380px]"
    >
      <header className="flex items-center justify-between gap-3 bg-brand-ink px-4 py-3 text-white">
        <span className="flex items-center gap-2.5">
          <svg viewBox={MARK_VIEW_BOX} width={23} height={20} fill="currentColor" className="text-brand-pale">
            <path d={SLAB_UP} />
            <path d={SLAB_DOWN} />
          </svg>
          <span className="font-display text-sm font-semibold">Cruise</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Cruise"
          className="rounded-full p-1.5 transition hover:bg-white/10"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground">{GREETING}</p>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-brand/40 hover:bg-brand-pale/40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2.5 text-sm text-white"
                : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface-muted px-3.5 py-2.5 text-sm"
            }
          >
            {message.content || (pending ? "Looking…" : "")}
          </div>
        ))}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-3"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about your courses…"
          maxLength={2000}
          aria-label="Ask Cruise"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Send"
          className="rounded-lg bg-brand p-2.5 text-white transition hover:brightness-110 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>

      <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Cruise can be wrong — check anything that matters. This conversation is not saved.
      </p>
    </div>
  );
}
