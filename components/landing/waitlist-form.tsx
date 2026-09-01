"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { joinWaitlistAction } from "@/app/waitlist/actions";

/**
 * Join the waitlist.
 *
 * Consent is a ticked box with the wording beside it, not an assumption made
 * from the act of typing an address. That is the NDPA position and also the
 * only defensible one for a platform that sells data-protection training: a
 * pre-ticked box on CopaServe's own signup form would be the first thing a
 * sceptical buyer screenshots.
 *
 * Email is the only required field. Every extra box costs signups, and a name
 * can be asked for later; the interest select earns its place because knowing
 * which domain people came for decides what gets built first.
 */
const INTERESTS = [
  "Data Protection (NDPA)",
  "Compliance & Governance",
  "Cybersecurity",
  "Web3 & Emerging Tech",
  "Corporate training for my organisation",
];

export function WaitlistForm({ consentText, source }: { consentText: string; source?: string }) {
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [alreadyOn, setAlreadyOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("working");

    const formData = new FormData(event.currentTarget);

    try {
      const result = await joinWaitlistAction(formData);
      if (!result.ok) {
        setError(result.error);
        setStatus("idle");
        return;
      }
      setAlreadyOn(result.alreadyOn);
      setStatus("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-brand-bright/30 bg-white/5 p-8 text-center backdrop-blur">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-bright/15">
          <Check className="size-6 text-brand-bright" />
        </span>
        <h3 className="mt-4 font-display text-xl font-bold text-white">
          {alreadyOn ? "You are already on the list" : "You are on the list"}
        </h3>
        <p className="mt-2 text-sm text-white/60">
          We will email you once, when CopaServe opens. Nothing else until then.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="source" value={source ?? "landing"} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/80">
            Email <span className="text-brand-bright">*</span>
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/35 focus:border-brand-bright/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/80">
            Name <span className="font-normal text-white/40">(optional)</span>
          </span>
          <input
            name="name"
            autoComplete="name"
            placeholder="Ada Okonkwo"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/35 focus:border-brand-bright/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/80">
            Organisation <span className="font-normal text-white/40">(optional)</span>
          </span>
          <input
            name="organisation"
            autoComplete="organization"
            placeholder="Where you work"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/35 focus:border-brand-bright/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white/80">
            Most interested in <span className="font-normal text-white/40">(optional)</span>
          </span>
          <select
            name="interest"
            defaultValue=""
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur transition focus:border-brand-bright/60"
          >
            <option value="" className="bg-brand-ink">
              Not sure yet
            </option>
            {INTERESTS.map((interest) => (
              <option key={interest} value={interest} className="bg-brand-ink">
                {interest}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <input
          type="checkbox"
          required
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#05ff12]"
        />
        <span className="text-xs leading-relaxed text-white/60">{consentText}</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "working" || !consented}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-bright px-7 py-4 text-sm font-bold text-brand-ink shadow-[0_0_45px_-8px_rgba(5,255,18,0.65)] transition hover:shadow-[0_0_60px_-6px_rgba(5,255,18,0.9)] disabled:opacity-50 disabled:shadow-none sm:w-auto"
      >
        {status === "working" ? "Adding you..." : "Join the waitlist"}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </button>
    </form>
  );
}
