-- AlterTable
ALTER TABLE "SaasPayment" ADD COLUMN     "providerCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "availableAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
