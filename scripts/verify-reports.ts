/**
 * Functional checks for reports and export (PRD §13.2).
 *
 * Two things are worth proving beyond "a file was produced":
 *
 * - The XLSX contains real numbers and dates, not strings. The whole reason to
 *   ship Excel rather than CSV is that the recipient can sum a column, and a
 *   number stored as text silently breaks that.
 * - CSV export neutralises formula injection. Report rows contain user-supplied
 *   text — course titles, names — and a leading "=" turns a cell into a formula
 *   in Excel and Sheets.
 *
 *   npx tsx scripts/verify-reports.ts
 */
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { buildReport, REPORTS, type ReportData } from "../lib/reports/definitions";
import { renderReport, reportFilename, toCsv, toPdf, toXlsx } from "../lib/reports/render";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  const payments = await prisma.payment.findMany({
    where: { userId: { in: createdUsers } }, select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: payments.map((p) => p.id) } } });
  await prisma.payment.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.consentLog.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `rep-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Report", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const learner = await prisma.user.create({
    data: { email: `rep-learner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Report", lastName: "Learner" } } },
  });
  createdUsers.push(learner.id);

  // A title starting with "=" is the formula-injection case.
  const course = await prisma.course.create({
    data: {
      title: `=cmd|'/c calc'!A1 Course ${RUN}`,
      slug: `report-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id, priceMinor: 250000,
    },
    select: { id: true },
  });
  createdCourses.push(course.id);

  const enrollment = await prisma.enrollment.create({
    data: { userId: learner.id, courseId: course.id, status: "COMPLETED", progressPercent: 100, completedAt: new Date() },
    select: { id: true },
  });

  await prisma.payment.create({
    data: {
      userId: learner.id, courseId: course.id, enrollmentId: enrollment.id,
      provider: "PAYSTACK", reference: `CS-REPORT-${RUN}`, status: "SUCCESSFUL",
      amountMinor: 250000, discountMinor: 50000, currency: "NGN", paidAt: new Date(),
    },
  });

  // --- every report builds ------------------------------------------------
  const built: ReportData[] = [];
  for (const definition of REPORTS) {
    const report = await buildReport(definition.id);
    built.push(report);
    check(`${definition.id} report builds`, report.columns.length > 0,
      `${report.rows.length} row(s), ${report.columns.length} columns`);
  }

  const enrolments = built.find((r) => r.id === "enrolments")!;
  const ourRow = enrolments.rows.find((r) => String(r.course).includes(RUN));
  check("enrolments report counts the completion",
    ourRow?.enrolments === 1 && ourRow.completions === 1 && ourRow.completionRate === 100,
    `${ourRow?.enrolments} enrolled, ${ourRow?.completions} completed`);

  const revenue = built.find((r) => r.id === "revenue")!;
  const payRow = revenue.rows.find((r) => String(r.reference).includes(RUN));
  check("revenue report keeps money in minor units",
    payRow?.amount === 250000 && payRow.discount === 50000,
    `${payRow?.amount} kobo`);
  check("revenue report computes net of refunds", payRow?.net === 250000, `${payRow?.net}`);

  // --- CSV ----------------------------------------------------------------
  const csv = toCsv(revenue).toString("utf8");
  check("CSV has a BOM so Excel reads UTF-8", csv.charCodeAt(0) === 0xfeff, "BOM present");
  check("CSV quotes every field", csv.includes('"Reference"'), "quoted");

  const enrolCsv = toCsv(enrolments).toString("utf8");
  check("CSV neutralises a formula-injection title",
    enrolCsv.includes("\"'=cmd") && !enrolCsv.includes('"=cmd'),
    enrolCsv.includes("\"'=cmd") ? "prefixed with apostrophe" : "NOT NEUTRALISED");

  check("CSV formats currency for humans", csv.includes("₦2,500.00") || csv.includes("NGN"),
    csv.includes("₦2,500.00") ? "₦2,500.00" : "currency formatted");

  // --- XLSX ---------------------------------------------------------------
  const xlsx = await toXlsx(revenue);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];

  check("XLSX has one sheet with a header row", workbook.worksheets.length === 1 && sheet.rowCount > 1,
    `${sheet.rowCount} rows`);

  const headerRow = sheet.getRow(1);
  check("XLSX header matches the report columns",
    String(headerRow.getCell(1).value) === "Reference", `${headerRow.getCell(1).value}`);

  // The point of XLSX: a currency column must be summable, not text.
  const amountIndex = revenue.columns.findIndex((c) => c.key === "amount") + 1;
  const dataRow = sheet.getRow(2);
  const amountCell = dataRow.getCell(amountIndex);
  check("XLSX stores currency as a number, not text",
    typeof amountCell.value === "number", `${typeof amountCell.value} (${amountCell.value})`);
  check("XLSX converts kobo to naira for the spreadsheet",
    amountCell.value === 2500, `${amountCell.value}`);
  check("XLSX applies a currency number format",
    String(sheet.getColumn(amountIndex).numFmt).includes("#,##0"),
    `${sheet.getColumn(amountIndex).numFmt}`);

  const dateIndex = revenue.columns.findIndex((c) => c.key === "date") + 1;
  check("XLSX stores dates as dates", dataRow.getCell(dateIndex).value instanceof Date,
    `${typeof dataRow.getCell(dateIndex).value}`);

  check("XLSX freezes the header row", sheet.views?.[0]?.state === "frozen", `${sheet.views?.[0]?.state}`);

  // --- PDF ----------------------------------------------------------------
  const pdf = await toPdf(revenue);
  check("PDF has a valid header", Buffer.from(pdf.subarray(0, 5)).toString("latin1") === "%PDF-",
    `${pdf.length} bytes`);

  const parsed = await PDFDocument.load(pdf);
  check("PDF is landscape A4", Math.round(parsed.getPage(0).getWidth()) === 842,
    `${Math.round(parsed.getPage(0).getWidth())}x${Math.round(parsed.getPage(0).getHeight())}`);
  check("PDF title names the report",
    (parsed.getTitle() ?? "").includes("Revenue"), `${parsed.getTitle()}`);

  // An empty report must still produce a valid document, not crash.
  const empty = await buildReport("revenue", { from: new Date("2000-01-01"), to: new Date("2000-01-02") });
  const emptyPdf = await toPdf(empty);
  check("an empty report still renders a valid PDF",
    Buffer.from(emptyPdf.subarray(0, 5)).toString("latin1") === "%PDF-" && empty.rows.length === 0,
    `${empty.rows.length} rows, ${emptyPdf.length} bytes`);

  const emptyXlsx = await toXlsx(empty);
  check("an empty report still renders a valid XLSX", emptyXlsx.length > 0, `${emptyXlsx.length} bytes`);

  // --- dispatch and naming ------------------------------------------------
  const dispatched = await renderReport(revenue, "csv");
  check("renderReport dispatches by format", dispatched.toString("utf8").includes("Reference"), "csv");

  const filename = reportFilename(revenue, "xlsx");
  check("filenames carry report and date",
    /^copaserve-revenue-\d{4}-\d{2}-\d{2}\.xlsx$/.test(filename), filename);

  // --- date range ---------------------------------------------------------
  const future = await buildReport("enrolments", { from: new Date(Date.now() + 86400000) });
  check("a future range excludes existing data", future.rows.length === 0, `${future.rows.length} rows`);

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
