-- Instructor earnings, payouts, and where to send them.
--
-- The split is 70% to the instructor and 30% to CopaServe, on what the learner
-- actually paid. Earnings are held for 30 days from payment so a refund or
-- chargeback in that window is absorbed before any money leaves, and a payout
-- is only made once an instructor's available balance reaches the minimum.
-- The numbers live in lib/earnings.ts, not here: this is only storage.

-- CreateEnum
CREATE TYPE "EarningKind" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('OPEN', 'IN_PAYOUT', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "instructor_earnings" (
    "id" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "courseId" UUID,
    "kind" "EarningKind" NOT NULL DEFAULT 'SALE',
    "status" "EarningStatus" NOT NULL DEFAULT 'OPEN',
    "grossMinor" INTEGER NOT NULL,
    "shareMinor" INTEGER NOT NULL,
    "platformMinor" INTEGER NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "payoutId" UUID,
    "voidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_payouts" (
    "id" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "recordedById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_earnings_instructorId_status_idx" ON "instructor_earnings"("instructorId", "status");

-- CreateIndex
CREATE INDEX "instructor_earnings_paymentId_idx" ON "instructor_earnings"("paymentId");

-- CreateIndex
CREATE INDEX "instructor_earnings_payoutId_idx" ON "instructor_earnings"("payoutId");

-- CreateIndex
CREATE INDEX "instructor_payouts_instructorId_status_idx" ON "instructor_payouts"("instructorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_userId_key" ON "payout_accounts"("userId");

-- AddForeignKey
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_earnings" ADD CONSTRAINT "instructor_earnings_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "instructor_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payouts" ADD CONSTRAINT "instructor_payouts_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_payouts" ADD CONSTRAINT "instructor_payouts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One sale earning per payment, enforced by the database rather than trusted
-- to the code that writes it. A payment confirmed twice — two webhooks racing,
-- a retried callback — must not credit an instructor twice. Prisma cannot
-- express a partial unique index, hence the raw SQL.
CREATE UNIQUE INDEX "instructor_earnings_one_sale_per_payment"
  ON "instructor_earnings"("paymentId") WHERE "kind" = 'SALE';

-- Row-level security, in the same migration that creates the tables. Every
-- other table has it; enquiries went out without it once because Prisma does
-- not write it, and was readable by anyone holding the public key until it was
-- noticed. These hold instructors' bank details and what they are owed.
--
-- No policies: nothing in the browser reads these. Pages and actions go
-- through Prisma as the table owner, which bypasses RLS.
ALTER TABLE "instructor_earnings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructor_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payout_accounts" ENABLE ROW LEVEL SECURITY;
