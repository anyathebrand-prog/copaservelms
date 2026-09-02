import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

/**
 * Certificate PDF rendering (PRD §11.2).
 *
 * Renders with pdf-lib rather than a headless browser: no native binary, no
 * Chromium in the deploy image, and it runs anywhere the app runs. The trade is
 * that layout is coordinate-based rather than CSS, which is acceptable for one
 * fixed template.
 *
 * Palette is the brand green (§6.3). §11.2 specified purple and gold, which
 * conflicted with the brand; §17 question 1 settled it in favour of green on
 * 2026-09-01, which is what this already did. The PRD text is now the stale
 * one — see DECISIONS.md.
 */

export type CertificateFields = {
  studentName: string;
  courseName: string;
  instructorName: string;
  /** Printed under the signature line; falls back to "Instructor". */
  instructorTitle?: string | null;
  institutionName: string;
  /** Absolute URL of the institution mark; falls back to the bundled asset. */
  logoUrl?: string | null;
  certificateNumber: string;
  credentialId: string;
  issueDate: Date;
  expiryDate: Date | null;
  verificationUrl: string;
};

const BRAND = rgb(0.039, 0.318, 0.055); // #0a510e
const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.357, 0.396, 0.361);
const PALE = rgb(0.863, 0.973, 0.867); // #dcf8dd

/** A4 landscape, in points. */
const WIDTH = 841.89;
const HEIGHT = 595.28;

export async function renderCertificatePdf(fields: CertificateFields): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  pdf.setTitle(`${fields.courseName} — ${fields.studentName}`);
  pdf.setSubject(`Certificate ${fields.certificateNumber}`);
  pdf.setProducer(fields.institutionName);
  // Metadata is part of the artefact: a verifier reading the file's properties
  // should find the same credential id the QR points at.
  pdf.setKeywords([fields.credentialId, fields.certificateNumber]);

  const page = pdf.addPage([WIDTH, HEIGHT]);

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Border
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: rgb(1, 1, 1) });
  page.drawRectangle({
    x: 24, y: 24, width: WIDTH - 48, height: HEIGHT - 48,
    borderColor: BRAND, borderWidth: 2,
  });
  page.drawRectangle({
    x: 32, y: 32, width: WIDTH - 64, height: HEIGHT - 64,
    borderColor: PALE, borderWidth: 1,
  });

  const centre = (text: string, font: typeof serif, size: number, y: number, color = INK) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (WIDTH - width) / 2, y, size, font, color });
  };

  // Institution logo (§11.2). Read from disk rather than fetched: issuance
  // must not depend on the app being reachable over HTTP, and a missing file
  // falls back to the wordmark rather than failing the certificate.
  const logo = await loadLogo(pdf, fields.logoUrl);
  if (logo) {
    const logoHeight = 34;
    const logoWidth = logoHeight * (logo.width / logo.height);
    page.drawImage(logo.image, {
      x: (WIDTH - logoWidth) / 2,
      y: HEIGHT - 78 - logoHeight / 2,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    centre(fields.institutionName.toUpperCase(), sansBold, 11, HEIGHT - 80, BRAND);
  }
  // The institution name used to sit here, under the logo. Removed: the logo
  // already says who issued this, and the awarding institution is still named
  // in the signature block and on the verification page, which is where anyone
  // checking the certificate actually looks.
  centre("CERTIFICATE OF COMPLETION", serifBold, 30, HEIGHT - 132, INK);
  centre("This is to certify that", serif, 13, HEIGHT - 175, MUTED);

  // The holder's name is the focal point, so it is sized to fit rather than
  // truncated — a certificate that cuts off a long name is unusable.
  const nameSize = fitTextSize(fields.studentName, serifBold, 40, WIDTH - 220, 20);
  centre(fields.studentName, serifBold, nameSize, HEIGHT - 235, BRAND);

  page.drawLine({
    start: { x: 140, y: HEIGHT - 252 }, end: { x: WIDTH - 140, y: HEIGHT - 252 },
    thickness: 1, color: PALE,
  });

  centre("has successfully completed", serif, 13, HEIGHT - 282, MUTED);

  const courseSize = fitTextSize(fields.courseName, serifBold, 24, WIDTH - 220, 14);
  centre(fields.courseName, serifBold, courseSize, HEIGHT - 320, INK);

  // QR — links to the public verification page (§11.3).
  const qrPng = await QRCode.toBuffer(fields.verificationUrl, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#0a510e", light: "#ffffff" },
  });
  const qrImage = await pdf.embedPng(qrPng);
  const qrSize = 104;
  page.drawImage(qrImage, { x: WIDTH - 160, y: 76, width: qrSize, height: qrSize });
  page.drawText("Scan to verify", {
    x: WIDTH - 158, y: 62, size: 8, font: sans, color: MUTED,
  });

  // Signature block
  page.drawLine({
    start: { x: 90, y: 132 }, end: { x: 300, y: 132 }, thickness: 1, color: MUTED,
  });
  page.drawText(fields.instructorName, { x: 90, y: 140, size: 12, font: serifBold, color: INK });
  page.drawText(fields.instructorTitle?.trim() || "Instructor", {
    x: 90, y: 116, size: 9, font: sans, color: MUTED,
  });

  // Credential block
  const details: [string, string][] = [
    ["Certificate No.", fields.certificateNumber],
    ["Credential ID", fields.credentialId],
    ["Issued", formatDate(fields.issueDate)],
  ];
  if (fields.expiryDate) details.push(["Expires", formatDate(fields.expiryDate)]);

  details.forEach(([label, value], index) => {
    const y = 140 - index * 16;
    page.drawText(`${label}:`, { x: 360, y, size: 9, font: sans, color: MUTED });
    page.drawText(value, { x: 440, y, size: 9, font: sansBold, color: INK });
  });

  page.drawText(fields.verificationUrl, {
    x: 90, y: 52, size: 8, font: sans, color: MUTED,
  });

  return pdf.save();
}

/**
 * Embed the brand lockup, or null when it is unavailable.
 *
 * A certificate without a logo is still a valid certificate; one that fails to
 * generate is not. So this never throws.
 */
async function loadLogo(pdf: PDFDocument, logoUrl?: string | null) {
  try {
    // A configured mark is fetched; otherwise the bundled one is read from
    // disk, so issuance does not depend on the network in the normal case.
    const bytes = logoUrl
      ? new Uint8Array(await (await fetch(logoUrl)).arrayBuffer())
      : await readFile(join(process.cwd(), "public/brand/copaserve-logo.png"));
    const image = await pdf.embedPng(bytes);
    return { image, width: image.width, height: image.height };
  } catch {
    return null;
  }
}

/** Shrink until the text fits the available width, down to a floor. */
function fitTextSize(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  startSize: number,
  maxWidth: number,
  minSize: number,
): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  return size;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}
