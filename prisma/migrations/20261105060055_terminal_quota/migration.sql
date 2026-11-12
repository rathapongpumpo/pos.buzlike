-- CreateTable
CREATE TABLE "PosTerminal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosTerminal_tenantId_idx" ON "PosTerminal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_tenantId_clientId_key" ON "PosTerminal"("tenantId", "clientId");
