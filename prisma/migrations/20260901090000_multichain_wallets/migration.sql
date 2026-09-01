
-- AlterEnum
BEGIN;
CREATE TYPE "WalletProvider_new" AS ENUM ('WALLETCONNECT', 'METAMASK', 'COINBASE', 'RAINBOW', 'PHANTOM', 'SOLFLARE', 'BACKPACK');
ALTER TABLE "wallets" ALTER COLUMN "provider" TYPE "WalletProvider_new" USING ("provider"::text::"WalletProvider_new");
ALTER TYPE "WalletProvider" RENAME TO "WalletProvider_old";
ALTER TYPE "WalletProvider_new" RENAME TO "WalletProvider";
DROP TYPE "public"."WalletProvider_old";
COMMIT;

-- DropIndex
DROP INDEX "wallets_userId_address_chainId_key";

-- AlterTable
ALTER TABLE "mint_transactions" DROP COLUMN "chainId",
ADD COLUMN     "chainKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "wallet_challenges" ADD COLUMN     "chainKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "wallets" DROP COLUMN "chainId",
ADD COLUMN     "chainKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_address_chainKey_key" ON "wallets"("userId", "address", "chainKey");

