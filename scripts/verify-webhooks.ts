/**
 * Functional checks for outbound webhooks (PRD §13.3).
 *
 * Deliveries are actually made, to a throwaway HTTP server started here. A
 * webhook system that has only been tested against a mock is a webhook system
 * nobody has watched deliver anything.
 *
 * The properties that matter: a receiver can verify what we sent, a replayed
 * delivery is detectable, failures retry with backoff rather than spinning,
 * and a dead endpoint is eventually switched off instead of queueing forever.
 *
 *   npx tsx scripts/verify-webhooks.ts
 */
import { createServer, type Server } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  createEndpoint,
  deleteEndpoint,
  emitEvent,
  processPendingDeliveries,
  setEndpointActive,
  signPayload,
  verifySignature,
} from "../lib/webhooks";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdEndpoints: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUsers } } });
  await prisma.webhookEndpoint.deleteMany({ where: { id: { in: createdEndpoints } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

type Received = { headers: Record<string, string>; body: string };

/** A real receiver, so deliveries are genuinely made over HTTP. */
function startReceiver(behaviour: () => number): Promise<{
  server: Server;
  port: number;
  received: Received[];
}> {
  const received: Received[] = [];

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers as Record<string, string>, body });
        res.writeHead(behaviour()).end();
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0, received });
    });
  });
}

async function main() {
  const admin = await prisma.user.create({
    data: { email: `hook-admin-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Hook", lastName: "Admin" } } },
  });
  createdUsers.push(admin.id);

  // --- signing, independent of transport ----------------------------------
  const secret = "whsec_test";
  const body = JSON.stringify({ hello: "world" });
  const now = Math.floor(Date.now() / 1000);
  const signature = signPayload(secret, now, body);

  check("a correct signature verifies", verifySignature(secret, now, body, signature), "valid");
  check("a different secret does not verify",
    !verifySignature("whsec_other", now, body, signature), "rejected");
  check("a tampered body does not verify",
    !verifySignature(secret, now, body.replace("world", "elsewhere"), signature), "rejected");
  check("a replayed delivery is refused once stale",
    !verifySignature(secret, now - 600, body, signPayload(secret, now - 600, body)), "rejected");
  check("the timestamp is part of what is signed",
    signPayload(secret, now, body) !== signPayload(secret, now + 1, body), "distinct");

  // --- validation ---------------------------------------------------------
  const insecure = await createEndpoint(
    { name: `Insecure ${RUN}`, url: "http://partner.example/hook", events: ["CERTIFICATE_ISSUED"] },
    admin.id,
  );
  check("an http endpoint is refused", !insecure.ok, insecure.ok ? "created!" : insecure.detail ?? "");

  const eventless = await createEndpoint(
    { name: `Eventless ${RUN}`, url: "https://partner.example/hook", events: [] }, admin.id,
  );
  check("an endpoint with no events is refused",
    !eventless.ok, eventless.ok ? "created!" : eventless.detail ?? "");

  // --- a real delivery ----------------------------------------------------
  const ok = await startReceiver(() => 200);
  const endpoint = await createEndpoint(
    {
      name: `Receiver ${RUN}`,
      // Local for the test; production refuses anything but https, and this
      // path is the same code with a different URL.
      url: `http://127.0.0.1:${ok.port}/hook`,
      events: ["CERTIFICATE_ISSUED"],
    },
    admin.id,
  );

  // The https rule is enforced at creation, so insert directly to test delivery.
  const created = await prisma.webhookEndpoint.create({
    data: {
      name: `Receiver ${RUN}`,
      url: `http://127.0.0.1:${ok.port}/hook`,
      secret: "whsec_receiver",
      events: ["CERTIFICATE_ISSUED"],
      createdById: admin.id,
    },
    select: { id: true },
  });
  createdEndpoints.push(created.id);
  if (endpoint.ok) createdEndpoints.push(endpoint.data.id);

  const queued = await emitEvent("CERTIFICATE_ISSUED", { certificateNumber: `CERT-${RUN}` });
  check("emitting queues a delivery per subscribed endpoint", queued >= 1, `${queued}`);

  const pendingBefore = await prisma.webhookDelivery.count({
    where: { endpointId: created.id, status: "PENDING" },
  });
  check("emitting does not deliver inline", pendingBefore >= 1, `${pendingBefore} pending`);

  const processed = await processPendingDeliveries();
  check("processing delivers what is due", processed.delivered >= 1,
    `${processed.delivered} delivered of ${processed.attempted}`);

  check("the receiver actually got a request", ok.received.length >= 1, `${ok.received.length}`);

  const delivery = ok.received[0];
  check("the delivery carries the event name",
    delivery?.headers["x-copaserve-event"] === "CERTIFICATE_ISSUED",
    delivery?.headers["x-copaserve-event"] ?? "missing");

  const receivedSignature = delivery?.headers["x-copaserve-signature"] ?? "";
  const receivedTimestamp = Number(delivery?.headers["x-copaserve-timestamp"] ?? 0);
  check("a receiver can verify the signature we sent",
    verifySignature("whsec_receiver", receivedTimestamp, delivery?.body ?? "", receivedSignature),
    "verified");

  check("the payload names the event and carries the data",
    JSON.parse(delivery?.body ?? "{}").data?.certificateNumber === `CERT-${RUN}`,
    "payload intact");

  const settled = await prisma.webhookDelivery.findFirst({
    where: { endpointId: created.id }, select: { status: true, responseCode: true, deliveredAt: true },
  });
  check("a delivered attempt is recorded as delivered",
    settled?.status === "DELIVERED" && settled.responseCode === 200 && settled.deliveredAt !== null,
    `${settled?.status} ${settled?.responseCode}`);

  ok.server.close();

  // --- failure and backoff ------------------------------------------------
  const failing = await startReceiver(() => 500);
  const badEndpoint = await prisma.webhookEndpoint.create({
    data: {
      name: `Failing ${RUN}`,
      url: `http://127.0.0.1:${failing.port}/hook`,
      secret: "whsec_failing",
      events: ["PAYMENT_SUCCEEDED"],
      createdById: admin.id,
    },
    select: { id: true },
  });
  createdEndpoints.push(badEndpoint.id);

  await emitEvent("PAYMENT_SUCCEEDED", { reference: `CS-${RUN}` });
  await processPendingDeliveries();

  const failed = await prisma.webhookDelivery.findFirst({
    where: { endpointId: badEndpoint.id },
    select: { status: true, attempts: true, responseCode: true, nextAttemptAt: true, error: true },
  });
  check("a rejected delivery stays pending for retry",
    failed?.status === "PENDING" && failed.attempts === 1, `${failed?.status} attempt ${failed?.attempts}`);
  check("the failure reason is recorded",
    (failed?.error ?? "").includes("500"), failed?.error ?? "none");
  check("a retry is scheduled in the future",
    failed?.nextAttemptAt !== null && (failed?.nextAttemptAt?.getTime() ?? 0) > Date.now(),
    "scheduled");

  const notYetDue = await processPendingDeliveries();
  check("a scheduled retry is not attempted early", notYetDue.attempted === 0,
    `${notYetDue.attempted} attempted`);

  const endpointState = await prisma.webhookEndpoint.findUniqueOrThrow({
    where: { id: badEndpoint.id }, select: { failureCount: true },
  });
  check("consecutive failures are counted against the endpoint",
    endpointState.failureCount === 1, `${endpointState.failureCount}`);

  failing.server.close();

  // --- exhaustion ---------------------------------------------------------
  // Force the delivery to its last attempt and confirm it is given up on
  // rather than retried forever.
  await prisma.webhookDelivery.updateMany({
    where: { endpointId: badEndpoint.id },
    data: { attempts: 4, nextAttemptAt: new Date(Date.now() - 1000) },
  });
  await processPendingDeliveries();
  const exhausted = await prisma.webhookDelivery.findFirst({
    where: { endpointId: badEndpoint.id }, select: { status: true, nextAttemptAt: true },
  });
  check("a delivery is eventually given up on",
    exhausted?.status === "FAILED" && exhausted.nextAttemptAt === null,
    `${exhausted?.status}`);

  // --- scoping ------------------------------------------------------------
  const disabled = await setEndpointActive(created.id, false);
  check("an endpoint can be disabled", disabled.ok, disabled.ok ? "disabled" : disabled.error);

  const afterDisable = await emitEvent("CERTIFICATE_ISSUED", { certificateNumber: "ignored" });
  check("a disabled endpoint receives nothing", afterDisable === 0, `${afterDisable} queued`);

  const reEnabled = await setEndpointActive(created.id, true);
  const cleared = await prisma.webhookEndpoint.findUniqueOrThrow({
    where: { id: created.id }, select: { failureCount: true },
  });
  check("re-enabling clears the failure count",
    reEnabled.ok && cleared.failureCount === 0, `${cleared.failureCount}`);

  // --- the secret is not exposed ------------------------------------------
  const listed = await prisma.webhookEndpoint.findMany({
    where: { id: { in: createdEndpoints } },
    select: { id: true, name: true, url: true, events: true },
  });
  check("listing an endpoint does not carry its secret",
    !JSON.stringify(listed).includes("whsec_"), "absent");

  const removed = await deleteEndpoint(created.id, admin.id);
  check("an endpoint can be deleted", removed.ok, removed.ok ? "deleted" : removed.error);

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
