import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

/**
 * Cruise — the assistant that helps people use CopaServe.
 *
 * Grounded, not general. A support assistant on a certification platform that
 * invents a course name, a price, or the status of somebody's certificate does
 * more damage than no assistant at all: the whole product is a claim that what
 * it tells you is true. So the catalogue is put into the prompt verbatim, and
 * anything about a particular learner is fetched with a tool rather than
 * recalled.
 *
 * Signed-in only, and deliberately so. An assistant on a public page is an open
 * invitation to spend somebody else's API budget, and this platform has no
 * rate-limiting store to lean on yet. Requiring a session bounds the cost to
 * people who already have accounts, and the learners who most need help are
 * signed in anyway.
 *
 * Nothing is persisted. The conversation lives in the browser and the server
 * is stateless — which for a platform that teaches data protection is the
 * easier position to defend than a transcript store full of other people's
 * questions.
 *
 * Configured through ANTHROPIC_API_KEY. Absent, Cruise reports itself
 * unavailable and nothing else changes — the same shape as the email, SMS,
 * payment and quiz-drafting drivers.
 */

export function cruiseConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** What a browser may send. Anything longer is refused rather than truncated. */
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TURNS = 20;

export type CruiseMessage = { role: "user" | "assistant"; content: string };

/**
 * Thinking stays on.
 *
 * Not for depth — this is a support assistant, and effort is set low. It is
 * because Claude Opus 5 with thinking disabled occasionally writes a tool call
 * into its visible reply instead of making one: the turn succeeds, the tool
 * never runs, and the learner is shown a fragment of machinery. Cruise has
 * tools, so that failure is live here. Thinking on with low effort avoids it
 * and still costs little.
 */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 2000;

/** How many times Claude may call tools before we stop the loop. */
const MAX_TOOL_ROUNDS = 4;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "my_courses",
    description:
      "The signed-in learner's own enrolments: course title, progress, whether it is finished, " +
      "and whether an assessment is still outstanding. Use this before saying anything about " +
      "what they are enrolled in or how far along they are.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "my_certificates",
    description:
      "The signed-in learner's certificates, with credential ids and status. Use this before " +
      "saying anything about whether they have earned a certificate. Never state that a " +
      "certificate exists without calling this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "course_details",
    description:
      "Full detail for one course in the catalogue: price, level, length, what it covers, and " +
      "whether it carries a certificate. Use the exact slug from the catalogue in the system " +
      "prompt.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string", description: "The course slug, e.g. working-deliberately" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
];

/**
 * The catalogue, verbatim.
 *
 * Small enough to inline — nine courses — and inlining it is what stops Cruise
 * inventing a tenth. Sits at the front of the system prompt so the cached
 * prefix covers it.
 */
async function catalogue(): Promise<string> {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: {
      slug: true,
      title: true,
      subtitle: true,
      level: true,
      priceMinor: true,
      currency: true,
      estimatedMinutes: true,
      category: { select: { name: true } },
    },
  });

  if (courses.length === 0) return "The catalogue is empty at the moment.";

  return courses
    .map((course) => {
      const price =
        course.priceMinor === 0
          ? "Free"
          : new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: course.currency,
              maximumFractionDigits: 0,
            }).format(course.priceMinor / 100);

      const hours = course.estimatedMinutes ? `${Math.round(course.estimatedMinutes / 60)}h` : "—";

      return `- ${course.title} (slug: ${course.slug}) · ${course.category?.name ?? "Uncategorised"} · ${course.level.toLowerCase()} · ${hours} · ${price}${course.subtitle ? ` — ${course.subtitle}` : ""}`;
    })
    .join("\n");
}

function instructions(catalogueText: string, firstName: string): string {
  return `You are Cruise, the assistant on CopaServe — a Nigerian professional certification platform run by Business Intelligence Technologies Limited, Lagos. CopaServe teaches data protection (the NDPA 2023), compliance, cybersecurity and professional skills, and issues verifiable certificates.

You are talking to ${firstName}, who is signed in.

## The catalogue, in full

${catalogueText}

That list is complete. If someone asks about a course that is not on it, say CopaServe does not offer it rather than guessing at something similar.

## What you must not do

Never invent a course, a price, a length, or a policy. If you do not know, say so and point them at a person.

Never state whether someone has earned, been issued, or is owed a certificate without calling my_certificates first. Never state what they are enrolled in or how far along they are without calling my_courses first. A wrong answer about a certificate is worse than no answer, because the certificate is the thing the platform exists to make trustworthy.

Never ask for, and never repeat back, a password, a card number, a BVN, a NIN, or a one-time code. If someone volunteers one, tell them plainly not to share it and that nobody at CopaServe will ask for it. This is a data-protection platform; behaving otherwise teaches the wrong lesson.

Do not promise refunds, extensions, account deletion, or anything else that needs a human decision. Say it needs the team and that they can reach support from the site.

## How CopaServe actually works

A learner enrols on a course, works through its lessons, and then takes the assessment. Finishing the lessons alone does not earn a certificate — passing the course's quiz does. Once passed, the certificate is issued automatically and appears under Certificates, where it can be downloaded as a PDF. Every certificate carries a credential id that anyone can check at /verify without signing in, which is what makes it worth something to an employer.

Free courses enrol immediately. Paid courses go through checkout. Organisations can be invoiced instead of paying by card.

## How to answer

Be brief. Two or three sentences is usually enough, and a learner in the middle of a course does not want an essay. Use plain British English. Say "assessment" or "quiz", not "evaluation instrument".

Point at where things are rather than describing them abstractly: "your certificates are under Certificates in the sidebar" beats "certificates are available in the relevant section".

If the answer is that they need to finish something first, say which thing.`;
}

type ToolResult = { content: string; isError?: boolean };

/** Every tool is scoped to the caller. None takes a user id from the model. */
async function runTool(name: string, input: unknown, userId: string): Promise<ToolResult> {
  try {
    if (name === "my_courses") {
      const enrolments = await prisma.enrollment.findMany({
        where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
        select: {
          progressPercent: true,
          status: true,
          course: { select: { title: true, slug: true } },
        },
      });

      if (enrolments.length === 0) {
        return { content: "This learner is not enrolled in any course yet." };
      }

      return {
        content: enrolments
          .map(
            (e) =>
              `${e.course.title} (${e.course.slug}): ${e.progressPercent}% of lessons done, enrolment ${e.status.toLowerCase()}`,
          )
          .join("\n"),
      };
    }

    if (name === "my_certificates") {
      const certificates = await prisma.certificate.findMany({
        where: { userId },
        orderBy: { issuedAt: "desc" },
        select: {
          credentialId: true,
          status: true,
          issuedAt: true,
          enrollment: { select: { course: { select: { title: true } } } },
        },
      });

      if (certificates.length === 0) {
        return {
          content:
            "This learner has no certificates yet. A certificate is issued when the course's " +
            "assessment is passed, not when the lessons are finished.",
        };
      }

      return {
        content: certificates
          .map(
            (c) =>
              `${c.enrollment.course.title}: ${c.status.toLowerCase()}, credential ${c.credentialId}` +
              // Nullable: a certificate awaiting approval has no issue date yet.
              (c.issuedAt ? `, issued ${c.issuedAt.toISOString().slice(0, 10)}` : ", not yet issued"),
          )
          .join("\n"),
      };
    }

    if (name === "course_details") {
      const slug = typeof input === "object" && input !== null ? (input as { slug?: unknown }).slug : null;
      if (typeof slug !== "string") return { content: "No slug given.", isError: true };

      const course = await prisma.course.findFirst({
        where: { slug, status: "PUBLISHED" },
        select: {
          title: true,
          subtitle: true,
          description: true,
          level: true,
          priceMinor: true,
          currency: true,
          estimatedMinutes: true,
          certificateEnabled: true,
          category: { select: { name: true } },
          modules: { select: { title: true, _count: { select: { lessons: true } } } },
          quizzes: {
            where: { countsTowardCertificate: true },
            select: { title: true, passingScore: true },
          },
        },
      });

      if (!course) return { content: `No published course with slug "${slug}".`, isError: true };

      const price =
        course.priceMinor === 0
          ? "Free"
          : `${course.currency} ${(course.priceMinor / 100).toLocaleString()}`;

      return {
        content: [
          `${course.title}${course.subtitle ? ` — ${course.subtitle}` : ""}`,
          `Category: ${course.category?.name ?? "none"} · Level: ${course.level.toLowerCase()} · Price: ${price}`,
          course.estimatedMinutes ? `About ${Math.round(course.estimatedMinutes / 60)} hours.` : "",
          course.description ?? "",
          `Modules: ${course.modules.map((m) => `${m.title} (${m._count.lessons} lessons)`).join("; ")}`,
          course.quizzes.length > 0
            ? `Assessment: ${course.quizzes.map((q) => `${q.title}, pass mark ${q.passingScore}%`).join("; ")}`
            : "This course has no assessment yet, so it cannot issue a certificate.",
          course.certificateEnabled ? "Carries a certificate." : "Does not carry a certificate.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }

    return { content: `No tool named ${name}.`, isError: true };
  } catch (cause) {
    console.error("[cruise] tool failed", name, cause);
    return { content: "That lookup failed. Say so rather than guessing.", isError: true };
  }
}

export type CruiseError = "NOT_CONFIGURED" | "TOO_LONG" | "FAILED";

/**
 * Answer, streaming the text out as it arrives.
 *
 * A manual loop rather than the SDK's tool runner: the text has to reach the
 * browser while it is being written, and the loop has to stop after a fixed
 * number of tool rounds whatever the model decides. Both are easier to see
 * when the loop is here.
 */
export async function streamCruise(
  conversation: CruiseMessage[],
  user: { id: string; firstName: string },
  onText: (chunk: string) => void,
): Promise<{ ok: true } | { ok: false; error: CruiseError; detail?: string }> {
  if (!cruiseConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  if (conversation.length === 0 || conversation.length > MAX_TURNS) {
    return { ok: false, error: "TOO_LONG", detail: "Start a new conversation." };
  }
  if (conversation.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
    return { ok: false, error: "TOO_LONG", detail: "That message is too long." };
  }

  const system = instructions(await catalogue(), user.firstName);
  const messages: Anthropic.MessageParam[] = conversation.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const client = new Anthropic();

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // The catalogue and the rules are identical on every request, so they
        // are worth caching; the conversation after them is not.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        // Low effort: this is a support assistant, not a reasoning task, and
        // the cost of a chat route adds up faster than anything else here.
        output_config: { effort: "low" },
        tools: TOOLS,
        messages,
      });

      stream.on("text", onText);
      const response = await stream.finalMessage();

      if (response.stop_reason !== "tool_use") return { ok: true };

      // Out of rounds: let the model answer with what it has rather than
      // looping, and never leave the learner with silence.
      if (round === MAX_TOOL_ROUNDS) {
        onText("\n\nI could not finish looking that up. Try asking a narrower question.");
        return { ok: true };
      }

      const calls = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      // Every result goes back in one user message. Splitting them teaches the
      // model to stop asking for more than one thing at a time.
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        calls.map(async (call) => {
          const result = await runTool(call.name, call.input, user.id);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: result.content,
            ...(result.isError ? { is_error: true } : {}),
          };
        }),
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: results });
    }

    return { ok: true };
  } catch (cause) {
    if (cause instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "NOT_CONFIGURED", detail: "The Anthropic API key was rejected." };
    }
    if (cause instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "FAILED", detail: "Cruise is busy. Try again shortly." };
    }

    console.error("[cruise] failed", cause);
    return { ok: false, error: "FAILED", detail: "Cruise could not answer that." };
  }
}
