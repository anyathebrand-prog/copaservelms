/**
 * Notification transports (PRD §6.1: Resend for email, Termii for SMS).
 *
 * Same shape as the payment and storage drivers: one interface, a driver per
 * provider, and an explicit fallback when nothing is configured. The fallback
 * logs rather than throwing, because a missing email key should not break
 * certificate issuance — the certificate is still valid and still in the
 * dashboard. Delivery failures are recorded on the notification row instead.
 */

export type Delivery = {
  ok: boolean;
  /** Provider-side id, where one is returned. */
  providerId?: string | null;
  error?: string;
};

export interface EmailDriver {
  readonly id: string;
  send(input: { to: string; subject: string; html: string; text: string }): Promise<Delivery>;
}

export interface SmsDriver {
  readonly id: string;
  send(input: { to: string; text: string }): Promise<Delivery>;
}

// `||` rather than `??`: an env var set to an empty string is a common way to
// "unset" one, and ?? would pass the empty string through as the sender —
// which the provider rejects as an invalid domain.
const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || "CopaServe <no-reply@copaserve.ng>";
const SMS_SENDER = process.env.TERMII_SENDER_ID || "CopaServe";

class ResendDriver implements EmailDriver {
  readonly id = "resend";

  constructor(private apiKey: string) {}

  async send(input: { to: string; subject: string; html: string; text: string }): Promise<Delivery> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      const body = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) return { ok: false, error: body.message ?? response.statusText };
      return { ok: true, providerId: body.id ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

class TermiiDriver implements SmsDriver {
  readonly id = "termii";

  constructor(private apiKey: string) {}

  async send(input: { to: string; text: string }): Promise<Delivery> {
    try {
      const response = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          to: input.to,
          from: SMS_SENDER,
          sms: input.text,
          type: "plain",
          channel: "generic",
        }),
      });

      const body = (await response.json()) as { message_id?: string; message?: string };

      if (!response.ok) return { ok: false, error: body.message ?? response.statusText };
      return { ok: true, providerId: body.message_id ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Used when no provider is configured.
 *
 * Reports success so callers proceed, but marks the notification as undelivered
 * so nothing pretends a message was sent. In development this is the normal
 * case and the console line is the useful output.
 */
class ConsoleDriver implements EmailDriver, SmsDriver {
  readonly id = "console";

  async send(input: { to: string; subject?: string; text: string }): Promise<Delivery> {
    console.info(
      `[notifications] no provider configured — would send to ${input.to}: ` +
        `${input.subject ? `"${input.subject}" — ` : ""}${input.text.slice(0, 120)}`,
    );
    return { ok: false, error: "No provider configured." };
  }
}

export function getEmailDriver(): EmailDriver {
  const key = process.env.RESEND_API_KEY;
  return key ? new ResendDriver(key) : new ConsoleDriver();
}

export function getSmsDriver(): SmsDriver {
  const key = process.env.TERMII_API_KEY;
  return key ? new TermiiDriver(key) : new ConsoleDriver();
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function smsConfigured(): boolean {
  return Boolean(process.env.TERMII_API_KEY);
}
