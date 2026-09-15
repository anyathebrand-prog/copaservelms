/**
 * Talk to Kora for real.
 *
 * The Kora driver was written from documentation, and one thing in it could
 * not be settled by reading: whether amounts travel in naira or kobo. The docs
 * never say, and getting it wrong charges a learner a hundred times the price.
 *
 * Settled by running this: ₦1,234.56 sent as 1234.56 comes back from Kora as
 * "1234.56", so amounts are in the MAJOR unit and the driver's /100 is right.
 * Kept as a check rather than deleted, because that is exactly the kind of
 * thing a provider changes quietly.
 *
 * Two things worth knowing before editing it. Kora rejects an email on a
 * .test domain outright, so the usual demo addresses fail validation with a
 * message that says nothing about email. And an unpaid charge reports
 * amount_paid "0.00" while amount holds the asking price — the driver reads
 * the former, so units are checked here against the latter.
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
      email: "checks@copaserve.com.ng",
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

    // The whole point: units. Kora reports two numbers — `amount` is what the
    // charge is for, `amount_paid` is what has actually been paid. Units are
    // tested against the first, because nobody has paid this one.
    const raw = verified.raw as { amount?: string | number; amount_paid?: string | number };
    const readBackMinor = Math.round(Number(raw.amount ?? 0) * 100);
    const roundTripped = readBackMinor === AMOUNT_MINOR;

    check(
      "the amount survives the round trip (units are right)",
      roundTripped,
      `sent ${AMOUNT_MINOR} kobo, Kora holds ${JSON.stringify(raw.amount)}` +
        (roundTripped
          ? " — naira, as the driver assumes"
          : readBackMinor === AMOUNT_MINOR * 100
            ? " — Kora wants KOBO and the driver is sending naira"
            : " — units do not agree; do not take payments through Kora"),
    );

    check("currency comes back as NGN", verified.currency === "NGN", verified.currency);

    // amount_paid, not amount: reporting the asking price as paid would walk
    // straight past the underpayment check in finalisePayment.
    check("an unpaid charge reports nothing paid",
      verified.amountMinor === 0,
      `amount_paid ${JSON.stringify(raw.amount_paid)} -> ${verified.amountMinor} kobo`);

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
