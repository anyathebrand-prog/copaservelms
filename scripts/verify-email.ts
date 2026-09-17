/**
 * Send one real email through whichever provider is configured.
 *
 * The only way to know email works is to receive one. This sends through the
 * same getEmailDriver() the platform uses, so it proves the key, the sender
 * address and the provider together — then check the inbox, including spam.
 *
 *   npx tsx --env-file=.env scripts/verify-email.ts you@example.com
 */
import { emailConfigured, getEmailDriver } from "../lib/notifications/providers";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    throw new Error("Pass the address to send the test to: verify-email.ts you@example.com");
  }

  const driver = getEmailDriver();
  console.log(`provider: ${driver.id}${emailConfigured() ? "" : " (nothing configured)"}`);
  console.log(`from:     ${process.env.NOTIFICATION_FROM_EMAIL || "(default)"}`);

  const sentAt = new Date().toISOString();
  const result = await driver.send({
    to,
    subject: `CopaServe email check — ${sentAt.slice(0, 16).replace("T", " ")}`,
    html:
      "<p>This is a test from CopaServe.</p>" +
      `<p>If you can read this, email is working. Sent ${sentAt}.</p>`,
    text: `This is a test from CopaServe. If you can read this, email is working. Sent ${sentAt}.`,
  });

  console.log(result.ok ? `sent (id: ${result.providerId ?? "none returned"})` : `FAILED: ${result.error}`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
