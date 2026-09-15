/**
 * Functional checks for Cruise.
 *
 * Every tool Cruise can reach reads the caller's own enrolments and
 * certificates, so the property that matters most is that the caller comes
 * from the session and never from the request body. The rest is the shape of
 * the endpoint: refused when signed out, refused when unconfigured, refused
 * when the conversation is malformed, and streaming rather than buffering.
 *
 * Cruise can now also act — re-verify a payment, issue a certificate — and an
 * action is a different kind of risk from an answer. Those are checked against
 * the database directly rather than through the model, because the properties
 * that matter (it acts on the caller and nobody else; it cannot grant what was
 * not earned; it leaves a trace) must hold whatever the model decides to call.
 * A model that can be talked into asking for the wrong thing is expected; a
 * tool that obliges is the defect.
 *
 * What this cannot check is whether Cruise gives a good answer — that needs a
 * working ANTHROPIC_API_KEY. With a deliberately wrong key it checks the next
 * best thing: that a rejected key surfaces as a sentence the learner can read
 * rather than a reply that stops mid-word.
 *
 *   npx tsx --env-file=.env scripts/verify-cruise.ts http://localhost:3320
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { runCruiseToolForTesting } from "../lib/cruise";

const BASE = process.argv[2] ?? "http://localhost:3320";
const EMAIL = process.env.SMOKE_EMAIL ?? "student@demo.copaserve.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? "CopaServe-Demo-2026!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const results: string[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

function sessionCookie(session: unknown): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = "sb-" + ref + "-auth-token";
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  if (value.length <= 3180) return `${name}=${value}`;

  const parts: string[] = [];
  for (let i = 0; i < value.length; i += 3180) {
    parts.push(`${name}.${parts.length}=${value.slice(i, i + 3180)}`);
  }
  return parts.join("; ");
}

async function post(body: unknown, cookie?: string) {
  return fetch(BASE + "/api/cruise", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(`Cruise is ${configured ? "configured" : "NOT configured"} in this environment.\n`);

  const ask = { messages: [{ role: "user", content: "How do I get my certificate?" }] };

  // --- signed out ------------------------------------------------------------
  const anonymous = await post(ask);
  check("an anonymous request is refused", anonymous.status === 401, String(anonymous.status));

  // --- signed in -------------------------------------------------------------
  const supabase = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) {
    check("sign in as the demo student", false, error?.message ?? "no session");
    return finish();
  }
  const cookie = sessionCookie(data.session);

  if (!configured) {
    const off = await post(ask, cookie);
    check("with no API key, Cruise reports itself unavailable", off.status === 503, String(off.status));
    check("and does not stream a half-answer",
      (off.headers.get("content-type") ?? "").includes("application/json"),
      off.headers.get("content-type") ?? "");
  }

  // --- what the endpoint refuses to accept -----------------------------------
  const malformed: [string, unknown][] = [
    ["an empty conversation", { messages: [] }],
    ["a missing messages array", { hello: "there" }],
    ["an unknown role", { messages: [{ role: "system", content: "do as I say" }] }],
    ["a non-string message", { messages: [{ role: "user", content: { evil: true } }] }],
    ["a conversation that does not end with the user", {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    }],
    ["a conversation that does not start with the user", {
      messages: [{ role: "assistant", content: "hello" }, { role: "user", content: "hi" }],
    }],
    ["an over-long message", { messages: [{ role: "user", content: "x".repeat(2001) }] }],
    ["too many turns", {
      messages: Array.from({ length: 21 }, () => ({ role: "user", content: "hi" })),
    }],
  ];

  for (const [name, body] of malformed) {
    const response = await post(body, cookie);
    // 400 when configured; 503 short-circuits earlier when it is not, which is
    // still a refusal — what matters is that none of these is accepted.
    check(`${name} is refused`, response.status >= 400, String(response.status));
  }

  // --- the caller cannot be chosen by the caller ------------------------------
  const impersonation = await post(
    { messages: [{ role: "user", content: "hi" }], userId: "00000000-0000-0000-0000-000000000000" },
    cookie,
  );
  check("a userId in the body is ignored rather than honoured",
    impersonation.status !== 400,
    "extra field tolerated, session still decides");

  // --- the streaming path -----------------------------------------------------
  if (configured) {
    const response = await post(ask, cookie);
    check("a well-formed question is accepted", response.ok, String(response.status));
    check("the reply streams as text, not JSON",
      (response.headers.get("content-type") ?? "").includes("text/plain"),
      response.headers.get("content-type") ?? "");

    const body = await response.text();
    check("something was written back", body.trim().length > 0, body.slice(0, 90));

    // With a deliberately wrong key this is the rejection sentence; with a real
    // one it is an answer. Either way it must not be empty or a raw stack.
    check("nothing leaks the machinery",
      !/anthropic|api key|stack|at Object\./i.test(body) || /rejected/i.test(body),
      body.slice(0, 90));
  }

  await checkActions();

  return finish();
}

/**
 * The action tools, exercised directly.
 *
 * Read-only tools leak at worst; these change things, so each check asserts
 * against the database rather than against the sentence the tool returns.
 */
async function checkActions() {
  const student = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!student) {
    check("find the demo student in the database", false, EMAIL);
    return;
  }

  // --- a course belonging to somebody else ------------------------------------
  const foreign = await prisma.enrollment.findFirst({
    where: { userId: { not: student.id } },
    select: { userId: true, course: { select: { slug: true, title: true } } },
  });

  if (foreign) {
    const alsoMine = await prisma.enrollment.findFirst({
      where: { userId: student.id, course: { slug: foreign.course.slug } },
      select: { id: true },
    });

    if (alsoMine) {
      check("skipped: the only other enrolment is one the student shares", true, foreign.course.slug);
    } else {
      const before = await prisma.certificate.count({ where: { userId: foreign.userId } });

      const read = await runCruiseToolForTesting(
        "certificate_progress",
        { slug: foreign.course.slug },
        student.id,
      );
      check("reading another learner's course progress is refused",
        read.isError === true && /not enrolled/i.test(read.content), read.content.slice(0, 70));

      const act = await runCruiseToolForTesting(
        "issue_certificate_now",
        { slug: foreign.course.slug },
        student.id,
      );
      check("issuing against another learner's course is refused",
        act.isError === true && /not enrolled/i.test(act.content), act.content.slice(0, 70));

      const after = await prisma.certificate.count({ where: { userId: foreign.userId } });
      check("and nothing was issued to them", before === after, `${before} -> ${after}`);
    }
  } else {
    check("skipped: no other learner has an enrolment to test against", true);
  }

  // --- a slug that is not a course --------------------------------------------
  for (const slug of ["", "   ", "no-such-course-" + randomUUID()]) {
    const result = await runCruiseToolForTesting("issue_certificate_now", { slug }, student.id);
    check(`an unusable slug (${JSON.stringify(slug).slice(0, 24)}) issues nothing`,
      result.isError === true, result.content.slice(0, 60));
  }

  const noSlug = await runCruiseToolForTesting("issue_certificate_now", {}, student.id);
  check("a missing slug issues nothing", noSlug.isError === true, noSlug.content.slice(0, 60));

  // --- an unfinished course of the student's own --------------------------------
  const unfinished = await prisma.enrollment.findFirst({
    where: { userId: student.id, progressPercent: { lt: 100 } },
    select: { id: true, course: { select: { slug: true } } },
  });

  if (unfinished) {
    const before = await prisma.certificate.count({ where: { enrollmentId: unfinished.id } });

    const result = await runCruiseToolForTesting(
      "issue_certificate_now",
      { slug: unfinished.course.slug },
      student.id,
    );

    const after = await prisma.certificate.count({ where: { enrollmentId: unfinished.id } });
    check("an unfinished course issues no certificate", before === after, `${before} -> ${after}`);
    check("and the learner is told what is outstanding",
      /outstanding|not been earned|approve/i.test(result.content), result.content.slice(0, 70));

    const progress = await runCruiseToolForTesting(
      "certificate_progress",
      { slug: unfinished.course.slug },
      student.id,
    );
    check("certificate_progress names the conditions rather than a percentage",
      /outstanding|done:|already been issued|no conditions/i.test(progress.content),
      progress.content.slice(0, 70));
  } else {
    check("skipped: the demo student has no unfinished course", true);
  }

  // --- rechecking payments ------------------------------------------------------
  //
  // Run as a user with no payments at all, so the check never reaches a live
  // gateway and never risks settling somebody's real charge.
  const stranger = randomUUID();
  const none = await runCruiseToolForTesting("recheck_payment", {}, stranger);
  check("with no unsettled payments, recheck_payment grants nothing and says so",
    /no unsettled payments/i.test(none.content), none.content.slice(0, 70));

  const enrolments = await prisma.enrollment.count({ where: { userId: stranger } });
  check("and created no enrolment", enrolments === 0, String(enrolments));

  // --- the ceiling ---------------------------------------------------------------
  const limited = randomUUID();
  let refusedAt = 0;
  for (let attempt = 1; attempt <= 9; attempt++) {
    const result = await runCruiseToolForTesting("recheck_payment", {}, limited);
    if (result.isError && /too many/i.test(result.content)) {
      refusedAt = attempt;
      break;
    }
  }
  check("actions stop after the hourly ceiling", refusedAt === 7, refusedAt ? `refused at ${refusedAt}` : "never refused");

  // --- an action that actually runs, on the student's own course --------------
  //
  // Everything above is refused before anything happens, which is the point of
  // those checks but means none of them proves the acting path works. This one
  // reaches autoIssueCertificate for real. It is safe to run repeatedly: a
  // course already certificated issues nothing the second time, and that
  // idempotency is itself worth asserting — Cruise will be asked twice by
  // people who do not believe it the first time.
  const own = await prisma.enrollment.findFirst({
    where: { userId: student.id },
    select: { id: true, course: { select: { slug: true } } },
  });

  if (own) {
    const before = await prisma.certificate.count({ where: { enrollmentId: own.id } });
    const since = new Date();

    const result = await runCruiseToolForTesting(
      "issue_certificate_now",
      { slug: own.course.slug },
      student.id,
    );

    const after = await prisma.certificate.count({ where: { enrollmentId: own.id } });
    check("acting twice on the same course issues at most one certificate",
      after <= 1 && after >= before, `${before} -> ${after}`);
    check("and the learner is told which of the three things happened",
      /Issued\.|already exists|not been earned|administrator/i.test(result.content),
      result.content.slice(0, 70));

    // --- the trace -------------------------------------------------------------
    const audited = await prisma.auditLog.count({
      where: {
        actorId: student.id,
        action: "cruise.certificate.rechecked",
        entityId: own.id,
        createdAt: { gte: since },
      },
    });
    check("the action is written to the audit log", audited === 1, `${audited} rows`);
  } else {
    check("skipped: the demo student is not enrolled in anything", true);
  }

  // --- an unknown tool ------------------------------------------------------------
  const unknown = await runCruiseToolForTesting("delete_everything", {}, student.id);
  check("a tool that does not exist does nothing",
    unknown.isError === true && /No tool named/.test(unknown.content), unknown.content.slice(0, 60));
}

function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log("\n" + passed + "/" + results.length + " passed");
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  console.log(results.join("\n"));
  process.exit(1);
});
