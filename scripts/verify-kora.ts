/**
 * Talk to Kora for real.
 *
 * The Kora driver was written from documentation and never run against the
 * API, and one thing in it cannot be settled any other way: whether amounts
 * travel in naira or kobo. The docs never say. The evidence says naira — the
 * verify endpoint answers with "2000.00" — but evidence is not a round trip,
 * and getting it wrong charges a learner a hundred times the price.
 *
 * So this sends a known amount through initialize, reads it back through
 * verify, and asserts the two match to the kobo. If units are wrong the
 * numbers disagree and this fails loudly, here, rather than quietly on
 * somebody's card.
 *
 * Refuses a live key unless told otherwise. Initializing a charge does not
 * move money, but it writes a real transaction into a real merchant account,
 * and a test key costs nothing.
 *
 *   npx tsx --env-file=.env scripts/verify-kora.ts
 *   npx tsx --env-file=.env scripts/verify-kora.ts --allow-live
 */
import { createHmac } from "node:crypto";
import { createDriverForTesting, getPaymentDriver } from "../lib/payments/provider";

const results: string[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push((pass ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
}

/** A deliberately awkward amount: kobo that are not a round naira. */
const AMOUNT_MINOR = 123_456; // ₦1,234.56

async function main() {
  const key = process.env.KORA_SECRET_KEY;
  if (!key) {
    console.log(
      "KORA_SECRET_KEY is not set here.\n" +
        "Add your Kora *test* secret key to .env and run this again — it is the only\n" +
        "way to confirm the amount units before a real customer does.",
    );
    process.exit(1);
  }

  const live = !/test/i.test(key);
  if (live && !process.argv.includes("--allow-live")) {
    console.log(
      "That looks like a live key, so nothing was sent.\n" +
        "Initializing a charge writes a real transaction into your merchant account.\n" +
        "Use a test key, or pass --allow-live if you mean it.",
    );
    process.exit(1);
  }

  console.log(`Using a ${live ? "LIVE" : "test"} key.\n`);

  const driver = getPaymentDriver("KORA");
  const reference = `CS-KORA-CHECK-${Date.now()}`;

  // --- initialize -------------------------------------------------------------
  let checkoutUrl: string | null = null;
  try {
    const { checkoutUrl: url } = await driver.createCheckout({
      reference,
      amountMinor: AMOUNT_MINOR,
      currency: "NGN",
      email: "checks@demo.copaserve.test",
      callbackUrl: "https://www.copaserve.com.ng/payments/callback",
      metadata: { purpose: "driver check" },
    });
    checkoutUrl = url;
    check("Kora accepts a checkout", true, url.slice(0, 60));
  } catch (cause) {
    check("Kora accepts a checkout", false, (cause as Error).message);
    return finish();
  }

  check("and returns a hosted checkout page",
    checkoutUrl.startsWith("https://"), checkoutUrl.slice(0, 48));

  // --- verify -----------------------------------------------------------------
  try {
    const verified = await driver.verify(reference);

    check("the charge can be verified by our own reference",
      verified.reference === reference, verified.reference);

    // The whole point. An unpaid charge reports what it is *for*, which is the
    // number we sent — so units round-trip even before anybody pays.
    const roundTripped = verified.amountMinor === AMOUNT_MINOR;
    check(
      "the amount survives the round trip (units are right)",
      roundTripped,
      `sent ${AMOUNT_MINOR} kobo, read back ${verified.amountMinor} kobo` +
        (roundTripped
          ? ""
          : verified.amountMinor === AMOUNT_MINOR * 100
            ? " — Kora wants KOBO, the driver is sending naira"
            : verified.amountMinor === Math.round(AMOUNT_MINOR / 100)
              ? " — Kora wants NAIRA and got kobo, or the charge is unpaid and reports 0"
              : ""),
    );

    check("currency comes back as NGN", verified.currency === "NGN", verified.currency);
    check("an unpaid charge is not reported as successful",
      verified.status !== "SUCCESSFUL", verified.status);
  } catch (cause) {
    check("the charge can be verified by our own reference", false, (cause as Error).message);
  }

  // --- the signature scheme, against the real secret ---------------------------
  const body = JSON.stringify({
    event: "charge.success",
    data: { reference, amount: "1234.56", status: "success", currency: "NGN" },
  });
  const dataOnly = JSON.stringify(JSON.parse(body).data);

  check("a signature over the data object is accepted",
    driver.verifySignature(body, createHmac("sha256", key).update(dataOnly).digest("hex")));
  check("a signature over the whole body is refused",
    !driver.verifySignature(body, createHmac("sha256", key).update(body).digest("hex")));
  check("a signature made with another secret is refused",
    !createDriverForTesting("KORA", "not-the-key").verifySignature(
      body,
      createHmac("sha256", key).update(dataOnly).digest("hex"),
    ));

  return finish();
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
