-- AlterTable
ALTER TABLE "SaasPayment" ADD COLUMN     "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN     "checkoutHash" TEXT,
ADD COLUMN     "checkoutKey" TEXT,
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "receipt" JSONB,
ADD COLUMN     "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stripeInvoiceId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingSyncedAt" TIMESTAMP(3),
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeSubscriptionStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "selectedPlan" "PlanCode";

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "objectId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PROCESSED',
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "BillingLock" (
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingLock_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaasPayment_checkoutKey_key" ON "SaasPayment"("checkoutKey");

-- CreateIndex
CREATE UNIQUE INDEX "SaasPayment_stripeInvoiceId_key" ON "SaasPayment"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SaasPayment_stripePaymentIntentId_key" ON "SaasPayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "SaasPayment_tenantId_status_createdAt_idx" ON "SaasPayment"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_availableAt_idx" ON "WebhookEvent"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "BillingLock" ADD CONSTRAINT "BillingLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
