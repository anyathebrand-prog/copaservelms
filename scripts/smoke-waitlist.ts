/**
 * Submit the public waitlist form for real, against a running deployment.
 *
 * This exists because loading a page proves almost nothing about it. The
 * waitlist shipped with a broken submit twice over: first a `"use server"`
 * file re-exporting a string, which meant `GET /` returned 200 while every
 * `POST /` returned 500, and then a form that could only be driven from a
 * browser, so nothing short of a person clicking could tell.
 *
 * It works the way a browser with JavaScript disabled works: fetch the page,
 * read the action reference Next renders into the form, post multipart, then
 * check the row actually landed. No headless browser, no action id hardcoded.
 *
 *   npx tsx --env-file=.env scripts/smoke-waitlist.ts https://copaservelms.vercel.app
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const results: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

/** Next renders the action reference as $ACTION_* hidden fields on the form. */
function actionFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const match of html.matchAll(/name="(\$ACTION[^"]*)"(?:\s+value="([^"]*)")?/g)) {
    fields[match[1]!] = (match[2] ?? "")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  }

  return fields;
}

async function main() {
  const email = `smoke-${Date.now()}@demo.copaserve.test`;

  const page = await fetch(`${BASE}/`);
  check("the landing page loads", page.ok, `${page.status}`);
  const html = await page.text();

  check("the waitlist section is on the page", html.includes("Be first through"), "present");
  check("the consent wording is shown beside the box",
    html.includes("I agree that CopaServe"), "present");

  const fields = actionFields(html);
  check("the form carries a server action reference", Object.keys(fields).length >= 2,
    Object.keys(fields).join(", ") || "none");
  check("the form posts without JavaScript",
    /<form[^>]+method="POST"/i.test(html), "method=POST");

  if (Object.keys(fields).length === 0) return finish();

  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  body.append("email", email);
  body.append("name", "Smoke Test");
  body.append("organisation", "Verification");
  body.append("interest", "Cybersecurity");
  body.append("source", "smoke");
  body.append("consent", "yes");

  const submission = await fetch(`${BASE}/`, { method: "POST", body });
  check("submitting the form succeeds", submission.status < 400, `${submission.status}`);

  // The response is an RSC stream; what matters is the row, not the markup.
  const row = await prisma.waitlistEntry.findUnique({ where: { email } });
  check("the signup reached the database", row !== null, row ? row.email : "no row");
  check("the consent wording was stored with it",
    (row?.consentText?.length ?? 0) > 50, `${row?.consentText?.length ?? 0} chars`);
  check("an unsubscribe token was issued at signup",
    (row?.unsubscribeToken?.length ?? 0) >= 24, `${row?.unsubscribeToken?.length ?? 0} chars`);

  // --- consent is enforced server-side, not only in the markup ----------------
  const withoutConsent = new FormData();
  for (const [key, value] of Object.entries(fields)) withoutConsent.append(key, value);
  withoutConsent.append("email", `nc-${Date.now()}@demo.copaserve.test`);
  withoutConsent.append("source", "smoke");

  const refused = await fetch(`${BASE}/`, { method: "POST", body: withoutConsent });
  const created = await prisma.waitlistEntry.count({ where: { source: "smoke", email: { startsWith: "nc-" } } });
  check("posting without consent does not create a row",
    refused.status < 500 && created === 0, `${refused.status}, ${created} rows`);

  if (row) {
    await prisma.waitlistEntry.delete({ where: { id: row.id } });
    console.log("removed the test signup");
  }

  return finish();
}

function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed against ${BASE}`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
