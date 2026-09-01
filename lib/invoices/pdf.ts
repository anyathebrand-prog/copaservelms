import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { winAnsi } from "@/lib/pdf-text";
import { getSettings } from "@/lib/settings";
import { getInvoice } from "@/lib/invoices";

/**
 * Render an invoice as a PDF (PRD §13.2).
 *
 * A proforma has one job: be something a customer's finance team can act on.
 * That means it must carry a number they can quote, a total they can approve,
 * and — the part most generated invoices forget — somewhere to actually send
 * the money. An invoice without bank details is an amount, not an instruction.
 *
 * Drafts render too, watermarked as such. Quoting a customer a figure before
 * you commit to it is normal; letting them mistake the quote for a bill is not.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const BRAND = rgb(10 / 255, 81 / 255, 14 / 255);
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.45, 0.42);
const RULE = rgb(0.85, 0.87, 0.85);

function money(minor: number, currency: string): string {
  return winAnsi(
    new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 }).format(
      minor / 100,
    ),
  );
}

function date(value: Date | null | undefined): string {
  if (!value) return "—".replace("—", "-");
  return value.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}

export async function renderInvoicePdf(invoiceId: string): Promise<Uint8Array | null> {
  const [invoice, settings] = await Promise.all([getInvoice(invoiceId), getSettings()]);
  if (!invoice) return null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const text = (
    value: string,
    x: number,
    y: number,
    options: { size?: number; font?: typeof regular; color?: typeof INK } = {},
  ) => {
    page.drawText(winAnsi(value), {
      x,
      y,
      size: options.size ?? 10,
      font: options.font ?? regular,
      color: options.color ?? INK,
    });
  };

  /** Right-align, which is the only way a column of money is readable. */
  const rightText = (
    value: string,
    right: number,
    y: number,
    options: { size?: number; font?: typeof regular; color?: typeof INK } = {},
  ) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const safe = winAnsi(value);
    page.drawText(safe, {
      x: right - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      color: options.color ?? INK,
    });
  };

  let y = height - MARGIN;

  // --- header ---------------------------------------------------------------
  try {
    const logoBytes = await readFile(join(process.cwd(), "public/brand/copaserve-logo.png"));
    const logo = await pdf.embedPng(logoBytes);
    const logoWidth = 132;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - (logoWidth / logo.width) * logo.height,
      width: logoWidth,
      height: (logoWidth / logo.width) * logo.height,
    });
  } catch {
    // A missing logo must not cost the customer their invoice.
    text(settings.institutionName, MARGIN, y - 14, { size: 14, font: bold });
  }

  rightText(invoice.status === "DRAFT" ? "PROFORMA (DRAFT)" : "INVOICE", width - MARGIN, y - 4, {
    size: 20,
    font: bold,
    color: BRAND,
  });
  rightText(invoice.invoiceNumber ?? "Not yet issued", width - MARGIN, y - 22, {
    size: 10,
    color: MUTED,
  });

  y -= 64;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: RULE,
  });

  // --- parties ---------------------------------------------------------------
  y -= 26;
  text("FROM", MARGIN, y, { size: 8, font: bold, color: MUTED });
  text("BILL TO", width / 2, y, { size: 8, font: bold, color: MUTED });

  y -= 16;
  text(settings.institutionName, MARGIN, y, { size: 11, font: bold });
  text(invoice.billToName, width / 2, y, { size: 11, font: bold });

  y -= 14;
  if (settings.supportEmail) text(settings.supportEmail, MARGIN, y, { size: 9, color: MUTED });
  if (invoice.billToEmail) text(invoice.billToEmail, width / 2, y, { size: 9, color: MUTED });

  // --- dates -----------------------------------------------------------------
  y -= 34;
  const issued = invoice.issuedAt ? date(invoice.issuedAt) : "Not yet issued";
  text(`Issued: ${issued}`, MARGIN, y, { size: 9, color: MUTED });
  text(`Due: ${invoice.dueAt ? date(invoice.dueAt) : "On receipt"}`, MARGIN + 190, y, {
    size: 9,
    color: MUTED,
  });
  if (invoice.status === "PAID") {
    rightText(`PAID ${date(invoice.paidAt)}`, width - MARGIN, y, { size: 9, font: bold, color: BRAND });
  }
  if (invoice.status === "CANCELLED") {
    rightText("CANCELLED", width - MARGIN, y, { size: 9, font: bold, color: rgb(0.8, 0.1, 0.1) });
  }

  // --- line items ------------------------------------------------------------
  y -= 34;
  const qtyRight = width - MARGIN - 210;
  const unitRight = width - MARGIN - 110;
  const amountRight = width - MARGIN;

  text("DESCRIPTION", MARGIN, y, { size: 8, font: bold, color: MUTED });
  rightText("QTY", qtyRight, y, { size: 8, font: bold, color: MUTED });
  rightText("UNIT", unitRight, y, { size: 8, font: bold, color: MUTED });
  rightText("AMOUNT", amountRight, y, { size: 8, font: bold, color: MUTED });

  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 1, color: RULE });

  for (const line of invoice.lines) {
    y -= 22;
    // A long description is truncated rather than allowed to collide with the
    // quantity column, which would make the numbers unreadable.
    const maxWidth = qtyRight - MARGIN - 16;
    let label = line.description;
    while (regular.widthOfTextAtSize(winAnsi(label), 10) > maxWidth && label.length > 4) {
      label = `${label.slice(0, -5)}...`;
    }

    text(label, MARGIN, y);
    rightText(String(line.quantity), qtyRight, y);
    rightText(money(line.unitAmountMinor, invoice.currency), unitRight, y);
    rightText(money(line.amountMinor, invoice.currency), amountRight, y);
  }

  // --- totals ----------------------------------------------------------------
  y -= 18;
  page.drawLine({
    start: { x: width / 2, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: RULE,
  });

  y -= 20;
  rightText("Subtotal", unitRight, y, { color: MUTED });
  rightText(money(invoice.subtotalMinor, invoice.currency), amountRight, y);

  if (invoice.discountMinor > 0) {
    y -= 18;
    rightText("Discount", unitRight, y, { color: MUTED });
    rightText(`-${money(invoice.discountMinor, invoice.currency)}`, amountRight, y);
  }

  y -= 24;
  rightText("Total", unitRight, y, { size: 12, font: bold });
  rightText(money(invoice.totalMinor, invoice.currency), amountRight, y, {
    size: 12,
    font: bold,
    color: BRAND,
  });

  // --- how to pay --------------------------------------------------------------
  if (settings.bankAccountNumber || settings.bankName) {
    y -= 46;
    text("PAYMENT", MARGIN, y, { size: 8, font: bold, color: MUTED });
    y -= 16;
    if (settings.bankAccountName) text(settings.bankAccountName, MARGIN, y, { font: bold });
    y -= 14;
    if (settings.bankName) text(settings.bankName, MARGIN, y, { size: 9, color: MUTED });
    y -= 14;
    if (settings.bankAccountNumber) {
      text(settings.bankAccountNumber, MARGIN, y, { size: 9, color: MUTED });
    }
    if (invoice.invoiceNumber) {
      y -= 14;
      text(`Quote ${invoice.invoiceNumber} as the transfer reference.`, MARGIN, y, {
        size: 9,
        color: MUTED,
      });
    }
  }

  if (invoice.notes) {
    y -= 34;
    text("NOTES", MARGIN, y, { size: 8, font: bold, color: MUTED });
    y -= 16;
    text(invoice.notes.slice(0, 180), MARGIN, y, { size: 9, color: MUTED });
  }

  // --- footer -------------------------------------------------------------------
  if (settings.invoiceFooter) {
    text(settings.invoiceFooter.slice(0, 160), MARGIN, MARGIN - 12, { size: 8, color: MUTED });
  }

  return pdf.save();
}
