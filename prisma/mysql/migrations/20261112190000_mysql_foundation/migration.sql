-- CreateTable
CREATE TABLE `WorkerHeartbeat` (
    `name` VARCHAR(191) NOT NULL,
    `lastAttemptAt` DATETIME(3) NOT NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastFailureAt` DATETIME(3) NULL,
    `consecutiveFailures` INTEGER NOT NULL DEFAULT 0,
    `state` LONGTEXT NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OperationalControl` (
    `id` VARCHAR(64) NOT NULL DEFAULT 'platform',
    `outboundQuarantinedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `User` (
    `pendingPilotInvitationId` VARCHAR(64) NULL,
    `pendingPilotInvitationVersion` INTEGER NULL,
    `id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` LONGTEXT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `emailVerificationRequired` BOOLEAN NOT NULL DEFAULT false,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `selectedPlan` ENUM('FREE_TRIAL', 'STARTER_MONTHLY', 'STARTER_YEARLY', 'PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME_BUYOUT') NULL,
    `fullName` LONGTEXT NOT NULL,
    `phone` LONGTEXT NULL,
    `systemRole` ENUM('USER', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `GoogleIdentity` (
    `id` VARCHAR(64) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `GoogleIdentity_subject_key`(`subject`),
    UNIQUE INDEX `GoogleIdentity_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `GoogleLinkChallenge` (
    `id` VARCHAR(64) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `sessionVersion` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `GoogleLinkChallenge_tokenHash_key`(`tokenHash`),
    INDEX `GoogleLinkChallenge_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(64) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `businessType` ENUM('CAFE_BEVERAGE', 'RESTAURANT', 'RETAIL_SHOP') NOT NULL DEFAULT 'CAFE_BEVERAGE',
    `ownerId` VARCHAR(64) NOT NULL,
    `planCode` ENUM('FREE_TRIAL', 'STARTER_MONTHLY', 'STARTER_YEARLY', 'PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME_BUYOUT') NOT NULL DEFAULT 'FREE_TRIAL',
    `subscriptionStatus` ENUM('TRIALING', 'ACTIVE', 'LIFETIME_ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED') NOT NULL DEFAULT 'TRIALING',
    `trialEndsAt` DATETIME(3) NOT NULL,
    `currentPeriodEndsAt` DATETIME(3) NULL,
    `isLifetime` BOOLEAN NOT NULL DEFAULT false,
    `stripeCustomerId` VARCHAR(64) NULL,
    `stripeSubId` VARCHAR(64) NULL,
    `stripeSubscriptionStatus` LONGTEXT NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `billingSyncedAt` DATETIME(3) NULL,
    `maxBranches` INTEGER NOT NULL DEFAULT 1,
    `maxTerminals` INTEGER NOT NULL DEFAULT 1,
    `maxProducts` INTEGER NOT NULL DEFAULT 50,
    `maxStaff` INTEGER NOT NULL DEFAULT 3,
    `enableKds` BOOLEAN NOT NULL DEFAULT true,
    `enableQrOrder` BOOLEAN NOT NULL DEFAULT true,
    `enableRecipeBom` BOOLEAN NOT NULL DEFAULT true,
    `enableExport` BOOLEAN NOT NULL DEFAULT false,
    `companyName` LONGTEXT NULL,
    `taxId` VARCHAR(64) NULL,
    `billingAddress` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    UNIQUE INDEX `Tenant_stripeCustomerId_key`(`stripeCustomerId`),
    UNIQUE INDEX `Tenant_stripeSubId_key`(`stripeSubId`),
    UNIQUE INDEX `Tenant_id_ownerId_key`(`id`, `ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SaasPayment` (
    `providerCheckedAt` DATETIME(3) NULL,
    `checkoutKey` VARCHAR(191) NULL,
    `checkoutHash` LONGTEXT NULL,
    `checkoutUrl` LONGTEXT NULL,
    `checkoutExpiresAt` DATETIME(3) NULL,
    `stripeInvoiceId` VARCHAR(64) NULL,
    `stripePaymentIntentId` VARCHAR(64) NULL,
    `stripeSubscriptionId` VARCHAR(64) NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `receipt` JSON NULL,
    `refundedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `providerRef` VARCHAR(191) NULL,
    `couponCode` LONGTEXT NULL,
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `planCode` ENUM('FREE_TRIAL', 'STARTER_MONTHLY', 'STARTER_YEARLY', 'PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME_BUYOUT') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `vatAmount` DECIMAL(10, 2) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `slipImageUrl` LONGTEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `SaasPayment_checkoutKey_key`(`checkoutKey`),
    UNIQUE INDEX `SaasPayment_stripeInvoiceId_key`(`stripeInvoiceId`),
    UNIQUE INDEX `SaasPayment_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    UNIQUE INDEX `SaasPayment_providerRef_key`(`providerRef`),
    UNIQUE INDEX `SaasPayment_invoiceNumber_key`(`invoiceNumber`),
    INDEX `SaasPayment_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `SaasPayment_status_providerCheckedAt_idx`(`status`, `providerCheckedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `BillingLock` (
    `tenantId` VARCHAR(64) NOT NULL,
    `token` LONGTEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ReleaseSettings` (
    `id` VARCHAR(64) NOT NULL DEFAULT 'platform',
    `releaseMode` LONGTEXT NOT NULL DEFAULT 'LEGACY',
    `checkoutMode` LONGTEXT NOT NULL DEFAULT 'PUBLIC',
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedById` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotCampaign` (
    `id` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `status` LONGTEXT NOT NULL DEFAULT 'DRAFT',
    `capacity` INTEGER NOT NULL DEFAULT 5,
    `durationDays` INTEGER NOT NULL DEFAULT 30,
    `reservationHours` INTEGER NOT NULL DEFAULT 72,
    `entitlementProfile` LONGTEXT NOT NULL DEFAULT 'PILOT_PRO_V1',
    `entitlementsSnapshot` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `PilotCampaign_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotInvitation` (
    `id` VARCHAR(64) NOT NULL,
    `campaignId` VARCHAR(64) NOT NULL,
    `normalizedEmail` VARCHAR(254) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `claimedByUserId` VARCHAR(64) NULL,
    `claimedAt` DATETIME(3) NULL,
    `createdByUserId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `PilotInvitation_tokenHash_key`(`tokenHash`),
    INDEX `PilotInvitation_campaignId_normalizedEmail_idx`(`campaignId`, `normalizedEmail`),
    UNIQUE INDEX `PilotInvitation_campaignId_id_key`(`campaignId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotEnrollment` (
    `id` VARCHAR(64) NOT NULL,
    `campaignId` VARCHAR(64) NOT NULL,
    `ownerId` VARCHAR(64) NOT NULL,
    `invitationId` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RESERVED',
    `reservedUntil` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `entitlementsSnapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `PilotEnrollment_invitationId_key`(`invitationId`),
    INDEX `PilotEnrollment_campaignId_status_reservedUntil_idx`(`campaignId`, `status`, `reservedUntil`),
    INDEX `PilotEnrollment_status_endsAt_idx`(`status`, `endsAt`),
    INDEX `PilotEnrollment_tenantId_activatedAt_idx`(`tenantId`, `activatedAt`),
    UNIQUE INDEX `PilotEnrollment_campaignId_ownerId_key`(`campaignId`, `ownerId`),
    UNIQUE INDEX `PilotEnrollment_campaignId_invitationId_key`(`campaignId`, `invitationId`),
    UNIQUE INDEX `PilotEnrollment_campaignId_tenantId_key`(`campaignId`, `tenantId`),
    UNIQUE INDEX `PilotEnrollment_id_tenantId_key`(`id`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotWaitlistEntry` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `status` LONGTEXT NOT NULL DEFAULT 'WAITING',
    `notifyConsentAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `PilotWaitlistEntry_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotFeedback` (
    `id` VARCHAR(64) NOT NULL,
    `enrollmentId` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `submittedByUserId` VARCHAR(64) NOT NULL,
    `submittedByStaffId` VARCHAR(64) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `category` LONGTEXT NOT NULL,
    `message` LONGTEXT NOT NULL,
    `optionalRating` INTEGER NULL,
    `pageKey` LONGTEXT NOT NULL,
    `deviceClass` LONGTEXT NOT NULL,
    `severity` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `PilotFeedback_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `PilotFeedback_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `PilotFeedback_tenantId_submittedByStaffId_requestKey_key`(`tenantId`, `submittedByStaffId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotFeedbackHistory` (
    `id` VARCHAR(64) NOT NULL,
    `feedbackId` VARCHAR(64) NOT NULL,
    `actorUserId` VARCHAR(64) NOT NULL,
    `fromStatus` LONGTEXT NOT NULL,
    `toStatus` LONGTEXT NOT NULL,
    `note` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PilotAuditEvent` (
    `id` VARCHAR(64) NOT NULL,
    `campaignId` VARCHAR(64) NOT NULL,
    `enrollmentId` VARCHAR(64) NULL,
    `actorUserId` VARCHAR(64) NULL,
    `action` LONGTEXT NOT NULL,
    `reason` LONGTEXT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `PilotAuditEvent_campaignId_createdAt_idx`(`campaignId`, `createdAt`),
    INDEX `PilotAuditEvent_enrollmentId_createdAt_idx`(`enrollmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StoreBranch` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `taxId` VARCHAR(191) NULL,
    `receiptHeader` VARCHAR(191) NULL,
    `receiptFooter` LONGTEXT NULL DEFAULT 'ขอบคุณที่ใช้บริการ / Thank you!',
    `promptPayId` VARCHAR(191) NULL,
    `promptPayName` VARCHAR(191) NULL,
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 7.00,
    `vatInclusive` BOOLEAN NOT NULL DEFAULT true,
    `serviceChargeRate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `StoreBranch_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `StoreBranch_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StaffMember` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `displayName` LONGTEXT NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER') NOT NULL DEFAULT 'CASHIER',
    `pinCodeHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `StaffMember_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `StaffMember_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `StaffMember_tenantId_userId_key`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CashierShift` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `staffId` VARCHAR(64) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `closedAt` DATETIME(3) NULL,
    `startingCash` DECIMAL(10, 2) NOT NULL,
    `expectedCash` DECIMAL(10, 2) NULL,
    `actualCash` DECIMAL(10, 2) NULL,
    `cashDifference` DECIMAL(10, 2) NULL,
    `closingNote` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',

    INDEX `CashierShift_tenantId_branchId_idx`(`tenantId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `kitchenStation` VARCHAR(191) NOT NULL DEFAULT 'MAIN',
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Category_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `categoryId` VARCHAR(64) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` LONGTEXT NULL,
    `name` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `imageUrl` LONGTEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `costPrice` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `trackStockType` VARCHAR(191) NOT NULL DEFAULT 'RECIPE',
    `directStockQty` INTEGER NOT NULL DEFAULT 0,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 5,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `Product_tenantId_categoryId_idx`(`tenantId`, `categoryId`),
    UNIQUE INDEX `Product_tenantId_sku_key`(`tenantId`, `sku`),
    UNIQUE INDEX `Product_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StaffBranchAccess` (
    `tenantId` VARCHAR(64) NOT NULL,
    `staffId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,

    INDEX `StaffBranchAccess_tenantId_branchId_idx`(`tenantId`, `branchId`),
    PRIMARY KEY (`staffId`, `branchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `BranchProduct` (
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `BranchProduct_tenantId_branchId_productId_key`(`tenantId`, `branchId`, `productId`),
    PRIMARY KEY (`branchId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProductStockMovement` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `orderId` VARCHAR(64) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `quantityChange` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `ProductStockMovement_tenantId_branchId_createdAt_idx`(`tenantId`, `branchId`, `createdAt`),
    UNIQUE INDEX `ProductStockMovement_tenantId_branchId_orderId_productId_kin_key`(`tenantId`, `branchId`, `orderId`, `productId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ModifierGroup` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `minSelect` INTEGER NOT NULL DEFAULT 0,
    `maxSelect` INTEGER NOT NULL DEFAULT 1,

    INDEX `ModifierGroup_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ModifierOption` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `modifierGroupId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `priceDelta` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ModifierOption_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProductModifierGroup` (
    `tenantId` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `modifierGroupId` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProductModifierGroup_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`productId`, `modifierGroupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Ingredient` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `sku` LONGTEXT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `costPerUnit` DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    `lowStockThreshold` DECIMAL(10, 2) NOT NULL DEFAULT 500,

    INDEX `Ingredient_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RecipeBomItem` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `ingredientId` VARCHAR(64) NOT NULL,
    `quantityUsed` DECIMAL(10, 2) NOT NULL,

    INDEX `RecipeBomItem_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `RecipeBomItem_productId_ingredientId_key`(`productId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `BranchIngredientStock` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `ingredientId` VARCHAR(64) NOT NULL,
    `currentQty` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BranchIngredientStock_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `BranchIngredientStock_branchId_ingredientId_key`(`branchId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `ingredientId` VARCHAR(64) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `quantityChange` DECIMAL(12, 2) NOT NULL,
    `balanceAfter` DECIMAL(12, 2) NOT NULL,
    `referenceOrderId` VARCHAR(64) NULL,
    `note` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `StockMovement_tenantId_branchId_createdAt_idx`(`tenantId`, `branchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DiningZone` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `DiningZone_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DiningTable` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `zoneId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `seats` INTEGER NOT NULL DEFAULT 4,
    `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE',
    `activeQrToken` VARCHAR(191) NULL,
    `currentOrderId` VARCHAR(64) NULL,

    UNIQUE INDEX `DiningTable_activeQrToken_key`(`activeQrToken`),
    INDEX `DiningTable_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Order` (
    `clientOrderId` VARCHAR(64) NOT NULL,
    `requestHash` LONGTEXT NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `shiftId` VARCHAR(64) NULL,
    `staffId` VARCHAR(64) NULL,
    `tableId` VARCHAR(64) NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `queueNumber` INTEGER NOT NULL,
    `orderType` ENUM('DINE_IN', 'TAKEAWAY', 'DELIVERY') NOT NULL DEFAULT 'DINE_IN',
    `status` ENUM('OPEN', 'PAID', 'VOIDED', 'REFUNDED') NOT NULL DEFAULT 'OPEN',
    `kitchenStatus` ENUM('QUEUED', 'PREPARING', 'READY', 'SERVED') NOT NULL DEFAULT 'QUEUED',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountReason` LONGTEXT NULL,
    `serviceChargeAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `vatAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `grandTotal` DECIMAL(10, 2) NOT NULL,
    `customerNote` LONGTEXT NULL,
    `voidReason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `paidAt` DATETIME(3) NULL,

    INDEX `Order_tenantId_branchId_createdAt_idx`(`tenantId`, `branchId`, `createdAt`),
    UNIQUE INDEX `Order_tenantId_clientOrderId_key`(`tenantId`, `clientOrderId`),
    UNIQUE INDEX `Order_tenantId_orderNumber_key`(`tenantId`, `orderNumber`),
    UNIQUE INDEX `Order_tenantId_branchId_id_key`(`tenantId`, `branchId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OrderItem` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `orderId` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `unitPriceSnapshot` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `modifiersTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `lineTotal` DECIMAL(10, 2) NOT NULL,
    `kitchenStation` LONGTEXT NOT NULL DEFAULT 'MAIN',
    `kitchenStatus` ENUM('QUEUED', 'PREPARING', 'READY', 'SERVED') NOT NULL DEFAULT 'QUEUED',
    `note` LONGTEXT NULL,

    INDEX `OrderItem_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OrderItemModifier` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `orderItemId` VARCHAR(64) NOT NULL,
    `modifierName` LONGTEXT NOT NULL,
    `optionName` LONGTEXT NOT NULL,
    `priceDelta` DECIMAL(10, 2) NOT NULL,

    INDEX `OrderItemModifier_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OrderPayment` (
    `tenantId` VARCHAR(64) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `orderId` VARCHAR(64) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `cashReceived` DECIMAL(10, 2) NULL,
    `changeGiven` DECIMAL(10, 2) NULL,
    `referenceNo` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `OrderPayment_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `actorName` LONGTEXT NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `AuditLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CashMovement` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `shiftId` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `CashMovement_tenantId_shiftId_idx`(`tenantId`, `shiftId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PosTerminal` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `clientId` VARCHAR(64) NOT NULL,
    `branchId` VARCHAR(64) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `PosTerminal_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `PosTerminal_tenantId_clientId_key`(`tenantId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Plan` (
    `code` ENUM('FREE_TRIAL', 'STARTER_MONTHLY', 'STARTER_YEARLY', 'PRO_MONTHLY', 'PRO_YEARLY', 'LIFETIME_BUYOUT') NOT NULL,
    `name` LONGTEXT NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `maxBranches` INTEGER NOT NULL,
    `maxTerminals` INTEGER NOT NULL,
    `maxProducts` INTEGER NOT NULL,
    `maxStaff` INTEGER NOT NULL,
    `enableKds` BOOLEAN NOT NULL,
    `enableQrOrder` BOOLEAN NOT NULL,
    `enableRecipeBom` BOOLEAN NOT NULL,
    `enableExport` BOOLEAN NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Coupon` (
    `code` VARCHAR(191) NOT NULL,
    `percent` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `type` LONGTEXT NULL,
    `objectId` VARCHAR(64) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PROCESSED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `processedAt` DATETIME(3) NULL,
    `lastError` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    INDEX `WebhookEvent_status_availableAt_idx`(`status`, `availableAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RateLimit` (
    `key` VARCHAR(512) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `resetAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `EmailOutbox` (
    `pilotEnrollmentId` VARCHAR(64) NULL,
    `pilotEnrollmentVersion` INTEGER NULL,
    `pilotTargetEndsAt` DATETIME(3) NULL,
    `notificationKind` LONGTEXT NULL,
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `tenantId` VARCHAR(64) NULL,
    `paymentId` VARCHAR(64) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `to` VARCHAR(254) NOT NULL,
    `subject` LONGTEXT NOT NULL,
    `text` LONGTEXT NOT NULL,
    `encryptedText` LONGTEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(64) NULL,
    `failedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `lastError` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `EmailOutbox_paymentId_key`(`paymentId`),
    UNIQUE INDEX `EmailOutbox_dedupeKey_key`(`dedupeKey`),
    INDEX `EmailOutbox_tenantId_idx`(`tenantId`),
    INDEX `EmailOutbox_sentAt_failedAt_availableAt_idx`(`sentAt`, `failedAt`, `availableAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AccountToken` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `kind` ENUM('VERIFY_EMAIL', 'PASSWORD_RESET') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `AccountToken_tokenHash_key`(`tokenHash`),
    INDEX `AccountToken_userId_kind_idx`(`userId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StaffInvitation` (
    `id` VARCHAR(64) NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `staffId` VARCHAR(64) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `invitedBy` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `StaffInvitation_tokenHash_key`(`tokenHash`),
    INDEX `StaffInvitation_staffId_idx`(`staffId`),
    UNIQUE INDEX `StaffInvitation_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OnboardingDraft` (
    `userId` VARCHAR(64) NOT NULL,
    `requestKey` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL DEFAULT '',
    `businessType` ENUM('CAFE_BEVERAGE', 'RESTAURANT', 'RETAIL_SHOP') NOT NULL DEFAULT 'CAFE_BEVERAGE',
    `version` INTEGER NOT NULL DEFAULT 0,
    `completedSlug` LONGTEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OnboardingDraft_requestKey_key`(`requestKey`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OnboardingRequest` (
    `userId` VARCHAR(64) NOT NULL,
    `requestKey` CHAR(36) NOT NULL,
    `requestHash` LONGTEXT NOT NULL,
    `tenantId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),

    UNIQUE INDEX `OnboardingRequest_tenantId_key`(`tenantId`),
    PRIMARY KEY (`userId`, `requestKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DatabaseMutex` (
    `id` CHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_pendingPilotInvitationId_fkey` FOREIGN KEY (`pendingPilotInvitationId`) REFERENCES `PilotInvitation`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GoogleIdentity` ADD CONSTRAINT `GoogleIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GoogleLinkChallenge` ADD CONSTRAINT `GoogleLinkChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Tenant` ADD CONSTRAINT `Tenant_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaasPayment` ADD CONSTRAINT `SaasPayment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BillingLock` ADD CONSTRAINT `BillingLock_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ReleaseSettings` ADD CONSTRAINT `ReleaseSettings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotInvitation` ADD CONSTRAINT `PilotInvitation_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `PilotCampaign`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotInvitation` ADD CONSTRAINT `PilotInvitation_claimedByUserId_fkey` FOREIGN KEY (`claimedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotInvitation` ADD CONSTRAINT `PilotInvitation_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotEnrollment` ADD CONSTRAINT `PilotEnrollment_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `PilotCampaign`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotEnrollment` ADD CONSTRAINT `PilotEnrollment_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotEnrollment` ADD CONSTRAINT `PilotEnrollment_campaignId_invitationId_fkey` FOREIGN KEY (`campaignId`, `invitationId`) REFERENCES `PilotInvitation`(`campaignId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotEnrollment` ADD CONSTRAINT `PilotEnrollment_tenantId_ownerId_fkey` FOREIGN KEY (`tenantId`, `ownerId`) REFERENCES `Tenant`(`id`, `ownerId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotWaitlistEntry` ADD CONSTRAINT `PilotWaitlistEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_enrollmentId_tenantId_fkey` FOREIGN KEY (`enrollmentId`, `tenantId`) REFERENCES `PilotEnrollment`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_tenantId_branchId_fkey` FOREIGN KEY (`tenantId`, `branchId`) REFERENCES `StoreBranch`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_submittedByUserId_fkey` FOREIGN KEY (`submittedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_tenantId_submittedByStaffId_fkey` FOREIGN KEY (`tenantId`, `submittedByStaffId`) REFERENCES `StaffMember`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedbackHistory` ADD CONSTRAINT `PilotFeedbackHistory_feedbackId_fkey` FOREIGN KEY (`feedbackId`) REFERENCES `PilotFeedback`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotFeedbackHistory` ADD CONSTRAINT `PilotFeedbackHistory_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotAuditEvent` ADD CONSTRAINT `PilotAuditEvent_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `PilotCampaign`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotAuditEvent` ADD CONSTRAINT `PilotAuditEvent_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `PilotEnrollment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PilotAuditEvent` ADD CONSTRAINT `PilotAuditEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StoreBranch` ADD CONSTRAINT `StoreBranch_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StaffMember` ADD CONSTRAINT `StaffMember_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StaffMember` ADD CONSTRAINT `StaffMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashierShift` ADD CONSTRAINT `CashierShift_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `StoreBranch`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CashierShift` ADD CONSTRAINT `CashierShift_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `StaffMember`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffBranchAccess` ADD CONSTRAINT `StaffBranchAccess_tenantId_staffId_fkey` FOREIGN KEY (`tenantId`, `staffId`) REFERENCES `StaffMember`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StaffBranchAccess` ADD CONSTRAINT `StaffBranchAccess_tenantId_branchId_fkey` FOREIGN KEY (`tenantId`, `branchId`) REFERENCES `StoreBranch`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BranchProduct` ADD CONSTRAINT `BranchProduct_tenantId_branchId_fkey` FOREIGN KEY (`tenantId`, `branchId`) REFERENCES `StoreBranch`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BranchProduct` ADD CONSTRAINT `BranchProduct_tenantId_productId_fkey` FOREIGN KEY (`tenantId`, `productId`) REFERENCES `Product`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProductStockMovement` ADD CONSTRAINT `ProductStockMovement_tenantId_branchId_productId_fkey` FOREIGN KEY (`tenantId`, `branchId`, `productId`) REFERENCES `BranchProduct`(`tenantId`, `branchId`, `productId`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProductStockMovement` ADD CONSTRAINT `ProductStockMovement_tenantId_branchId_orderId_fkey` FOREIGN KEY (`tenantId`, `branchId`, `orderId`) REFERENCES `Order`(`tenantId`, `branchId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ModifierGroup` ADD CONSTRAINT `ModifierGroup_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ModifierOption` ADD CONSTRAINT `ModifierOption_modifierGroupId_fkey` FOREIGN KEY (`modifierGroupId`) REFERENCES `ModifierGroup`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProductModifierGroup` ADD CONSTRAINT `ProductModifierGroup_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProductModifierGroup` ADD CONSTRAINT `ProductModifierGroup_modifierGroupId_fkey` FOREIGN KEY (`modifierGroupId`) REFERENCES `ModifierGroup`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Ingredient` ADD CONSTRAINT `Ingredient_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RecipeBomItem` ADD CONSTRAINT `RecipeBomItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RecipeBomItem` ADD CONSTRAINT `RecipeBomItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BranchIngredientStock` ADD CONSTRAINT `BranchIngredientStock_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `StoreBranch`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BranchIngredientStock` ADD CONSTRAINT `BranchIngredientStock_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `StoreBranch`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DiningZone` ADD CONSTRAINT `DiningZone_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `StoreBranch`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DiningTable` ADD CONSTRAINT `DiningTable_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `DiningZone`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `StoreBranch`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `CashierShift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `StaffMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DiningTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItemModifier` ADD CONSTRAINT `OrderItemModifier_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderPayment` ADD CONSTRAINT `OrderPayment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `EmailOutbox` ADD CONSTRAINT `EmailOutbox_pilotEnrollmentId_fkey` FOREIGN KEY (`pilotEnrollmentId`) REFERENCES `PilotEnrollment`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `EmailOutbox` ADD CONSTRAINT `EmailOutbox_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccountToken` ADD CONSTRAINT `AccountToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StaffInvitation` ADD CONSTRAINT `StaffInvitation_tenantId_staffId_fkey` FOREIGN KEY (`tenantId`, `staffId`) REFERENCES `StaffMember`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OnboardingDraft` ADD CONSTRAINT `OnboardingDraft_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OnboardingRequest` ADD CONSTRAINT `OnboardingRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OnboardingRequest` ADD CONSTRAINT `OnboardingRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
