import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "@/app/generated/prisma/enums";

/**
 * Payment provider abstraction (PRD §6.1, §13.2).
 *
 * Paystack and Flutterwave differ in amount units, signature scheme, and
 * response shape. Everything above this file deals in kobo and a single
 * `VerifiedPayment`, so adding a third provider means adding a driver here and
 * nothing else.
 */

export type CheckoutRequest = {
  reference: string;
  /** Kobo. Drivers convert to whatever the provider expects. */
  amountMinor: number;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata: Record<string, string>;
};

export type VerifiedPayment = {
  reference: string;
  amountMinor: number;
  currency: string;
  status: "SUCCESSFUL" | "FAILED" | "PENDING";
  providerReference: string | null;
  paidAt: Date | null;
  raw: unknown;
};

export interface PaymentDriver {
  readonly id: PaymentProvider;
  /** Start a checkout and return the URL to send the payer to. */
  createCheckout(request: CheckoutRequest): Promise<{ checkoutUrl: string }>;
  /** Ask the provider what really happened. Never trust the redirect alone. */
  verify(reference: string): Promise<VerifiedPayment>;
  /** Confirm a webhook came from the provider. */
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** Extract the reference from a webhook body, or null if it is not a payment event. */
  parseWebhook(rawBody: string): { reference: string; event: string } | null;
}

/** Constant-time compare, so a signature check cannot be timed. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

class PaystackDriver implements PaymentDriver {
  readonly id = "PAYSTACK" as const;

  constructor(private secretKey: string) {}

  async createCheckout(request: CheckoutRequest) {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: request.reference,
        // Paystack expects the minor unit, which is what we store.
        amount: request.amountMinor,
        currency: request.currency,
        email: request.email,
        callback_url: request.callbackUrl,
        metadata: request.metadata,
      }),
    });

    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string };
    };

    if (!response.ok || !body.status || !body.data?.authorization_url) {
      throw new Error(`Paystack checkout failed: ${body.message ?? response.statusText}`);
    }

    return { checkoutUrl: body.data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );

    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; amount?: number; currency?: string; id?: number; paid_at?: string };
    };

    if (!response.ok || !body.status || !body.data) {
      throw new Error(`Paystack verify failed: ${body.message ?? response.statusText}`);
    }

    return {
      reference,
      amountMinor: body.data.amount ?? 0,
      currency: body.data.currency ?? "NGN",
      status:
        body.data.status === "success"
          ? "SUCCESSFUL"
          : body.data.status === "failed" || body.data.status === "abandoned"
            ? "FAILED"
            : "PENDING",
      providerReference: body.data.id ? String(body.data.id) : null,
      paidAt: body.data.paid_at ? new Date(body.data.paid_at) : null,
      raw: body.data,
    };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
  }

  parseWebhook(rawBody: string) {
    try {
      const body = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
      if (!body.data?.reference) return null;
      return { reference: body.data.reference, event: body.event ?? "unknown" };
    } catch {
      return null;
    }
  }
}

class FlutterwaveDriver implements PaymentDriver {
  readonly id = "FLUTTERWAVE" as const;

  constructor(
    private secretKey: string,
    /** Flutterwave signs webhooks with a separately configured hash, not the API key. */
    private webhookHash: string,
  ) {}

  async createCheckout(request: CheckoutRequest) {
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: request.reference,
        // Flutterwave expects major units, unlike Paystack.
        amount: request.amountMinor / 100,
        currency: request.currency,
        redirect_url: request.callbackUrl,
        customer: { email: request.email },
        meta: request.metadata,
      }),
    });

    const body = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };

    if (!response.ok || body.status !== "success" || !body.data?.link) {
      throw new Error(`Flutterwave checkout failed: ${body.message ?? response.statusText}`);
    }

    return { checkoutUrl: body.data.link };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );

    const body = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { status?: string; amount?: number; currency?: string; id?: number; created_at?: string };
    };

    if (!response.ok || body.status !== "success" || !body.data) {
      throw new Error(`Flutterwave verify failed: ${body.message ?? response.statusText}`);
    }

    return {
      reference,
      // Convert back to kobo at the boundary, so nothing above deals in majors.
      amountMinor: Math.round((body.data.amount ?? 0) * 100),
      currency: body.data.currency ?? "NGN",
      status:
        body.data.status === "successful"
          ? "SUCCESSFUL"
          : body.data.status === "failed"
            ? "FAILED"
            : "PENDING",
      providerReference: body.data.id ? String(body.data.id) : null,
      paidAt: body.data.created_at ? new Date(body.data.created_at) : null,
      raw: body.data,
    };
  }

  verifySignature(_rawBody: string, signature: string | null): boolean {
    // Flutterwave sends the configured hash verbatim rather than an HMAC of the
    // body, so there is nothing to compute — only to compare, in constant time.
    if (!signature || !this.webhookHash) return false;
    return safeEqual(this.webhookHash, signature);
  }

  parseWebhook(rawBody: string) {
    try {
      const body = JSON.parse(rawBody) as { event?: string; data?: { tx_ref?: string } };
      if (!body.data?.tx_ref) return null;
      return { reference: body.data.tx_ref, event: body.event ?? "unknown" };
    } catch {
      return null;
    }
  }
}

/**
 * Kora (formerly Korapay).
 *
 * Two things here differ from the drivers above in ways that fail silently if
 * got wrong, so both were read out of Kora's documentation rather than
 * assumed.
 *
 * Amounts are in the major unit. The docs never say so in words, but the
 * verify endpoint answers with "amount": "2000.00" — a two-decimal string no
 * minor-unit API would return. Sending kobo to an API expecting naira would
 * charge a learner a hundred times the price, which is the single worst bug
 * this file could contain.
 *
 * The webhook signature covers only the `data` object, not the whole body.
 * Paystack signs the entire payload and Flutterwave sends a static hash, so
 * the shape of this check is different from both of its neighbours: the body
 * is parsed, `data` is re-serialised, and that is what gets hashed.
 */
class KoraDriver implements PaymentDriver {
  readonly id = "KORA" as const;

  constructor(private secretKey: string) {}

  async createCheckout(request: CheckoutRequest) {
    const response = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: request.reference,
        // Major units, unlike Paystack. See the note above the class.
        amount: request.amountMinor / 100,
        currency: request.currency,
        customer: { email: request.email },
        redirect_url: request.callbackUrl,
        metadata: request.metadata,
      }),
    });

    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { checkout_url?: string };
    };

    if (!response.ok || !body.status || !body.data?.checkout_url) {
      throw new Error(`Kora checkout failed: ${body.message ?? response.statusText}`);
    }

    return { checkoutUrl: body.data.checkout_url };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const response = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );

    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: string | number;
        amount_paid?: string | number;
        currency?: string;
        paid_at?: string;
      };
    };

    if (!response.ok || !body.status || !body.data) {
      throw new Error(`Kora verify failed: ${body.message ?? response.statusText}`);
    }

    // amount_paid rather than amount: on a failed charge the first is 0 while
    // the second still shows what was asked for, and reporting the asking
    // price as paid would walk straight past the underpayment check.
    const paid = body.data.amount_paid ?? body.data.amount ?? 0;

    return {
      reference,
      // Back to kobo at the boundary, so nothing above this file deals in majors.
      amountMinor: Math.round(Number(paid) * 100),
      currency: body.data.currency ?? "NGN",
      status:
        body.data.status === "success"
          ? "SUCCESSFUL"
          : body.data.status === "failed" || body.data.status === "expired"
            ? "FAILED"
            : "PENDING",
      providerReference: body.data.reference ?? null,
      paidAt: body.data.paid_at ? new Date(body.data.paid_at) : null,
      raw: body.data,
    };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;

    // Only the data object is signed. Re-serialising what was parsed is what
    // Kora's own examples do; it matches because JSON.parse preserves key
    // order and JSON.stringify emits the compact form they signed.
    let payload: string;
    try {
      const parsed = JSON.parse(rawBody) as { data?: unknown };
      if (parsed.data === undefined) return false;
      payload = JSON.stringify(parsed.data);
    } catch {
      return false;
    }

    const expected = createHmac("sha256", this.secretKey).update(payload).digest("hex");
    return safeEqual(expected, signature);
  }

  parseWebhook(rawBody: string) {
    try {
      const body = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
      if (!body.data?.reference) return null;
      return { reference: body.data.reference, event: body.event ?? "unknown" };
    } catch {
      return null;
    }
  }
}

export function getPaymentDriver(provider: PaymentProvider): PaymentDriver {
  if (provider === "PAYSTACK") {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("Paystack is not configured. Set PAYSTACK_SECRET_KEY.");
    return new PaystackDriver(key);
  }

  if (provider === "FLUTTERWAVE") {
    const key = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!key) throw new Error("Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY.");
    return new FlutterwaveDriver(key, process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "");
  }

  if (provider === "KORA") {
    const key = process.env.KORA_SECRET_KEY;
    if (!key) throw new Error("Kora is not configured. Set KORA_SECRET_KEY.");
    return new KoraDriver(key);
  }

  throw new Error(`No driver for payment provider ${provider}.`);
}

/** Providers with credentials present, in the order they should be offered. */
export function availableProviders(): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  if (process.env.PAYSTACK_SECRET_KEY) providers.push("PAYSTACK");
  if (process.env.FLUTTERWAVE_SECRET_KEY) providers.push("FLUTTERWAVE");
  if (process.env.KORA_SECRET_KEY) providers.push("KORA");
  return providers;
}

/** Exported for tests: lets a driver be built with a known secret. */
export function createDriverForTesting(
  provider: PaymentProvider,
  secretKey: string,
  webhookHash = "",
): PaymentDriver {
  if (provider === "PAYSTACK") return new PaystackDriver(secretKey);
  if (provider === "KORA") return new KoraDriver(secretKey);
  return new FlutterwaveDriver(secretKey, webhookHash);
}
