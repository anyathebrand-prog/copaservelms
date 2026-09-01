/**
 * Make text safe for pdf-lib's standard fonts.
 *
 * StandardFonts are WinAnsi-encoded and throw on any character outside it —
 * including the naira sign, which appears in every currency column and would
 * otherwise make a revenue report or an invoice impossible to generate.
 * Embedding a Unicode font would mean shipping a TTF with every PDF; for
 * tabular documents, transliterating is the better trade.
 *
 * Shared rather than copied: this is now needed by reports, certificates and
 * invoices, and three drifting copies of a character map is how one document
 * type quietly starts throwing.
 */
export function winAnsi(text: string): string {
  return text
    .replace(/\u20a6/g, "NGN ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    // Anything still outside Latin-1 becomes a question mark rather than
    // throwing mid-render and losing the whole document.
    .replace(/[^\u0020-\u00ff]/g, "?");
}
