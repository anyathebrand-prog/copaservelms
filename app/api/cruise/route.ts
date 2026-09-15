import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_MESSAGE_CHARS,
  MAX_TURNS,
  cruiseConfigured,
  streamCruise,
  type CruiseMessage,
} from "@/lib/cruise";

/**
 * POST /api/cruise — ask Cruise something.
 *
 * Streams plain text as it is written, rather than making somebody watch a
 * spinner for eight seconds and then showing a paragraph all at once.
 *
 * Signed in only. The caller is taken from the session, never from the body:
 * every tool Cruise can reach reads — or acts on — that learner's own
 * enrolments, payments and certificates, so a user id accepted from the request
 * would be a way to reach somebody else's.
 *
 * Rate limited per account. Each request costs real money at Anthropic and some
 * of them re-verify a payment or render a certificate, so an open loop here is
 * an open tab. In-process and per-instance, which means a multi-instance
 * deployment gets more than this ceiling — it blunts a runaway client, it is
 * not a billing control. The spend cap in the Anthropic console is that.
 */
const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to use Cruise." }, { status: 401 });
  }

  if (!cruiseConfigured()) {
    return Response.json({ error: "Cruise is not available yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }

  const messages = parseMessages(body);
  if (!messages) {
    return Response.json(
      { error: `Send { messages: [{ role, content }] }, at most ${MAX_TURNS} of them.` },
      { status: 400 },
    );
  }

  // Counted only once the request is known to be answerable. A malformed body
  // never reaches the model, so charging it against the learner's budget would
  // let a buggy client lock them out of the path that works.
  const limit = rateLimit(`cruise:${user.id}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return Response.json(
      { error: "That is a lot of questions at once. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // The first name only. Cruise is given the least it needs to be civil —
  // no email, no phone, nothing that would matter if a prompt leaked.
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { firstName: true, displayName: true },
  });

  const firstName = profile?.displayName?.trim()?.split(" ")[0] || profile?.firstName || "there";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed || !text) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      const result = await streamCruise(messages, { id: user.id, firstName }, send);

      // An error after streaming has begun cannot become a status code, so it
      // is appended as text — better a visible sentence than a reply that
      // stops mid-word for no stated reason.
      if (!result.ok) send(result.detail ?? "Cruise could not answer that.");

      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies that buffer would defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

function parseMessages(body: unknown): CruiseMessage[] | null {
  if (typeof body !== "object" || body === null) return null;

  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_TURNS) return null;

  const parsed: CruiseMessage[] = [];
  for (const entry of messages) {
    if (typeof entry !== "object" || entry === null) return null;

    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim()) return null;
    if (content.length > MAX_MESSAGE_CHARS) return null;

    parsed.push({ role, content });
  }

  // The API requires the conversation to start with a user turn and the last
  // turn to be the question being asked.
  if (parsed[0]!.role !== "user" || parsed[parsed.length - 1]!.role !== "user") return null;

  return parsed;
}
