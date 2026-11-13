-- MariaDB 11.8 (Hostinger). UTC defaults are defined in the baseline.
ALTER TABLE `BranchProduct` ADD CONSTRAINT `BranchProduct_nonnegative`
  CHECK (quantity >= 0 AND price >= 0 AND version >= 0);
ALTER TABLE `ProductStockMovement` ADD CONSTRAINT `ProductStockMovement_valid`
  CHECK (balanceAfter >= 0 AND quantityChange <> 0 AND kind IN ('OPENING','ADJUSTMENT','SALE','RETURN'));
ALTER TABLE `SaasPayment` ADD CONSTRAINT `SaasPayment_refund_bounds`
  CHECK (refundedAmount >= 0 AND refundedAmount <= totalAmount);
ALTER TABLE `SaasPayment` ADD CONSTRAINT `SaasPayment_nonnegative_amounts`
  CHECK (amount >= 0 AND vatAmount >= 0 AND totalAmount >= 0);
ALTER TABLE `ReleaseSettings` ADD CONSTRAINT `ReleaseSettings_values` CHECK (
  id='platform' AND releaseMode IN ('LEGACY','PRIVATE_PILOT','COMMERCIAL')
  AND checkoutMode IN ('DISABLED','EXISTING_ONLY','PUBLIC')
  AND (releaseMode <> 'PRIVATE_PILOT' OR checkoutMode='DISABLED') AND version>=0);
ALTER TABLE `PilotCampaign` ADD CONSTRAINT `PilotCampaign_rules` CHECK (
  status IN ('DRAFT','OPEN','PAUSED','CLOSED') AND capacity BETWEEN 1 AND 5
  AND durationDays=30 AND reservationHours=72 AND entitlementProfile='PILOT_PRO_V1'
  AND JSON_LENGTH(entitlementsSnapshot)=9
  AND JSON_CONTAINS(entitlementsSnapshot,'{"profile":"PILOT_PRO_V1","maxBranches":3,"maxTerminals":-1,"maxProducts":-1,"maxStaff":-1,"enableKds":true,"enableQrOrder":true,"enableRecipeBom":true,"enableExport":true}'));
ALTER TABLE `PilotInvitation` ADD CONSTRAINT `PilotInvitation_rules` CHECK (
  BINARY normalizedEmail=BINARY LOWER(TRIM(normalizedEmail)) AND CHAR_LENGTH(normalizedEmail) BETWEEN 3 AND 254
  AND BINARY tokenHash REGEXP '^[a-f0-9]{64}$' AND tokenVersion>0 AND expiresAt>createdAt
  AND ((claimedByUserId IS NULL)=(claimedAt IS NULL)));
ALTER TABLE `PilotEnrollment` ADD CONSTRAINT `PilotEnrollment_states` CHECK (
  version>0 AND status IN ('RESERVED','ACTIVE','EXPIRED','REVOKED','CONVERTED','RELEASED') AND
  ((activatedAt IS NULL AND tenantId IS NULL AND endsAt IS NULL AND status IN ('RESERVED','RELEASED') AND reservedUntil IS NOT NULL)
  OR (activatedAt IS NOT NULL AND tenantId IS NOT NULL AND endsAt>activatedAt AND status IN ('ACTIVE','EXPIRED','REVOKED','CONVERTED'))));
-- MySQL has no partial unique indexes. This generated column gives equivalent semantics.
ALTER TABLE `PilotEnrollment` ADD COLUMN `activeTenantId` VARCHAR(64)
  GENERATED ALWAYS AS (CASE WHEN status='ACTIVE' THEN tenantId ELSE NULL END) VIRTUAL,
  ADD UNIQUE INDEX `PilotEnrollment_one_active_tenant` (`activeTenantId`);
ALTER TABLE `PilotWaitlistEntry` ADD CONSTRAINT `PilotWaitlist_status`
  CHECK (status IN ('WAITING','INVITED','WITHDRAWN'));
ALTER TABLE `PilotFeedback` ADD CONSTRAINT `PilotFeedback_fields` CHECK (
  category IN ('BUG','USABILITY','FEATURE','GENERAL') AND status IN ('NEW','TRIAGED','IN_PROGRESS','RESOLVED')
  AND (severity IS NULL OR severity IN ('P0','P1','P2','P3')) AND (optionalRating IS NULL OR optionalRating BETWEEN 1 AND 5)
  AND CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 2000 AND CHAR_LENGTH(pageKey) BETWEEN 1 AND 60
  AND deviceClass IN ('MOBILE','TABLET','DESKTOP','UNKNOWN'));
ALTER TABLE `EmailOutbox` ADD CONSTRAINT `EmailOutbox_pilot_reference` CHECK (
  (pilotEnrollmentId IS NULL AND pilotEnrollmentVersion IS NULL AND pilotTargetEndsAt IS NULL)
  OR (pilotEnrollmentId IS NOT NULL AND pilotEnrollmentVersion>0 AND pilotTargetEndsAt IS NOT NULL AND notificationKind IS NOT NULL));

-- A newly provisioned MySQL database is closed until an administrator opens admission.
INSERT INTO `ReleaseSettings` (id, releaseMode, checkoutMode, version, updatedAt)
  VALUES ('platform','PRIVATE_PILOT','DISABLED',0,UTC_TIMESTAMP(3));
INSERT INTO `OperationalControl` (id,outboundQuarantinedAt) VALUES ('platform',NULL);

CREATE TRIGGER `pos_init_product_branches` AFTER INSERT ON `Product` FOR EACH ROW
BEGIN
  INSERT INTO BranchProduct (tenantId,branchId,productId,price,quantity,isAvailable,version)
  SELECT NEW.tenantId,b.id,NEW.id,NEW.price,
    CASE WHEN b.id=(SELECT x.id FROM StoreBranch x WHERE x.tenantId=NEW.tenantId ORDER BY x.isActive DESC,x.id LIMIT 1)
      THEN NEW.directStockQty ELSE 0 END,NEW.isAvailable,0
  FROM StoreBranch b WHERE b.tenantId=NEW.tenantId;
END;
CREATE TRIGGER `pos_init_branch_products` AFTER INSERT ON `StoreBranch` FOR EACH ROW
BEGIN
  INSERT INTO BranchProduct (tenantId,branchId,productId,price,quantity,isAvailable,version)
  SELECT NEW.tenantId,NEW.id,p.id,p.price,0,p.isAvailable,0 FROM Product p WHERE p.tenantId=NEW.tenantId;
END;
CREATE TRIGGER `pos_branch_product_version` BEFORE UPDATE ON `BranchProduct` FOR EACH ROW
BEGIN
  SET NEW.version=OLD.version+IF(NOT(NEW.quantity<=>OLD.quantity) OR NOT(NEW.price<=>OLD.price) OR NOT(NEW.isAvailable<=>OLD.isAvailable),1,0);
END;
-- Do not update Product in the INSERT trigger: that insert may originate from Product's trigger.
CREATE TRIGGER `pos_branch_product_total_update` AFTER UPDATE ON `BranchProduct` FOR EACH ROW
BEGIN
  IF NEW.quantity<>OLD.quantity THEN
    UPDATE Product SET directStockQty=(SELECT COALESCE(SUM(quantity),0) FROM BranchProduct WHERE productId=NEW.productId AND tenantId=NEW.tenantId)
      WHERE id=NEW.productId AND tenantId=NEW.tenantId;
  END IF;
END;
CREATE TRIGGER `pos_branch_product_total_delete` AFTER DELETE ON `BranchProduct` FOR EACH ROW
BEGIN
  UPDATE Product SET directStockQty=(SELECT COALESCE(SUM(quantity),0) FROM BranchProduct WHERE productId=OLD.productId AND tenantId=OLD.tenantId)
    WHERE id=OLD.productId AND tenantId=OLD.tenantId;
END;
CREATE TRIGGER `PilotCampaign_frozen_terms` BEFORE UPDATE ON `PilotCampaign` FOR EACH ROW
BEGIN
  IF (NEW.capacity<>OLD.capacity OR NEW.durationDays<>OLD.durationDays OR NEW.reservationHours<>OLD.reservationHours
    OR NEW.entitlementProfile<>OLD.entitlementProfile
    OR NOT(JSON_CONTAINS(NEW.entitlementsSnapshot,OLD.entitlementsSnapshot) AND JSON_CONTAINS(OLD.entitlementsSnapshot,NEW.entitlementsSnapshot)))
    AND EXISTS(SELECT 1 FROM PilotInvitation WHERE campaignId=OLD.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot campaign terms already issued';
  END IF;
END;
CREATE TRIGGER `PilotEnrollment_guard_insert` BEFORE INSERT ON `PilotEnrollment` FOR EACH ROW
BEGIN
  DECLARE cap INT; DECLARE campaign_status VARCHAR(20); DECLARE snap LONGTEXT; DECLARE used_count INT;
  UPDATE PilotCampaign SET version=version+1 WHERE id=NEW.campaignId;
  SELECT capacity,status,entitlementsSnapshot INTO cap,campaign_status,snap FROM PilotCampaign WHERE id=NEW.campaignId;
  IF NEW.activatedAt IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reserve before activating';
  END IF;
  IF NEW.status='RESERVED' THEN
    IF campaign_status<>'OPEN' OR NEW.reservedUntil<=UTC_TIMESTAMP(3) OR NEW.reservedUntil>UTC_TIMESTAMP(3)+INTERVAL 72 HOUR THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid pilot reservation';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM PilotInvitation i JOIN `User` u ON u.id=NEW.ownerId
      WHERE i.id=NEW.invitationId AND i.campaignId=NEW.campaignId AND i.claimedByUserId=u.id AND i.claimedAt IS NOT NULL
      AND i.normalizedEmail=LOWER(TRIM(u.email)) AND u.emailVerifiedAt IS NOT NULL AND i.revokedAt IS NULL AND i.expiresAt>UTC_TIMESTAMP(3)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Unverified or invalid pilot invitation';
    END IF;
    IF NOT(JSON_CONTAINS(NEW.entitlementsSnapshot,snap) AND JSON_CONTAINS(snap,NEW.entitlementsSnapshot)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot profile does not match';
    END IF;
    SELECT COUNT(*) INTO used_count FROM PilotEnrollment WHERE campaignId=NEW.campaignId AND (activatedAt IS NOT NULL OR (status='RESERVED' AND reservedUntil>UTC_TIMESTAMP(3)));
    IF used_count>=cap THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot capacity exceeded'; END IF;
  END IF;
END;
CREATE TRIGGER `PilotEnrollment_guard_update` BEFORE UPDATE ON `PilotEnrollment` FOR EACH ROW
BEGIN
  DECLARE cap INT; DECLARE campaign_status VARCHAR(20); DECLARE snap LONGTEXT; DECLARE used_count INT;
  IF NEW.campaignId<>OLD.campaignId OR NEW.ownerId<>OLD.ownerId THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot identity cannot be reassigned';
  END IF;
  IF OLD.activatedAt IS NOT NULL AND (NOT(NEW.tenantId<=>OLD.tenantId) OR NEW.invitationId<>OLD.invitationId
    OR NOT(NEW.activatedAt<=>OLD.activatedAt) OR NOT(JSON_CONTAINS(NEW.entitlementsSnapshot,OLD.entitlementsSnapshot) AND JSON_CONTAINS(OLD.entitlementsSnapshot,NEW.entitlementsSnapshot))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Started pilot grant is immutable';
  END IF;
  IF NEW.version<>OLD.version+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot version must advance'; END IF;
  UPDATE PilotCampaign SET version=version+1 WHERE id=NEW.campaignId;
  SELECT capacity,status,entitlementsSnapshot INTO cap,campaign_status,snap FROM PilotCampaign WHERE id=NEW.campaignId;
  IF OLD.activatedAt IS NULL AND (NEW.status='RESERVED' OR NEW.activatedAt IS NOT NULL) THEN
    IF NOT EXISTS(SELECT 1 FROM PilotInvitation i JOIN `User` u ON u.id=NEW.ownerId
      WHERE i.id=NEW.invitationId AND i.campaignId=NEW.campaignId AND i.claimedByUserId=u.id AND i.claimedAt IS NOT NULL
      AND i.normalizedEmail=LOWER(TRIM(u.email)) AND u.emailVerifiedAt IS NOT NULL AND i.revokedAt IS NULL AND i.expiresAt>UTC_TIMESTAMP(3)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Unverified or invalid pilot invitation';
    END IF;
    IF NOT(JSON_CONTAINS(NEW.entitlementsSnapshot,snap) AND JSON_CONTAINS(snap,NEW.entitlementsSnapshot)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot profile does not match';
    END IF;
    IF NEW.status='RESERVED' AND (campaign_status<>'OPEN' OR NEW.reservedUntil<=UTC_TIMESTAMP(3) OR NEW.reservedUntil>UTC_TIMESTAMP(3)+INTERVAL 72 HOUR) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid pilot reservation';
    END IF;
    IF NEW.activatedAt IS NOT NULL AND (OLD.status<>'RESERVED' OR OLD.reservedUntil<=UTC_TIMESTAMP(3)
      OR NEW.activatedAt>UTC_TIMESTAMP(3) OR NEW.endsAt<>NEW.activatedAt+INTERVAL 30 DAY) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot reservation expired or period invalid';
    END IF;
  END IF;
  SELECT COUNT(*) INTO used_count FROM PilotEnrollment WHERE campaignId=NEW.campaignId AND id<>NEW.id AND (activatedAt IS NOT NULL OR (status='RESERVED' AND reservedUntil>UTC_TIMESTAMP(3)));
  IF used_count+IF(NEW.activatedAt IS NOT NULL OR (NEW.status='RESERVED' AND NEW.reservedUntil>UTC_TIMESTAMP(3)),1,0)>cap THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot capacity exceeded';
  END IF;
END;
CREATE TRIGGER `PilotEnrollment_guard_delete` BEFORE DELETE ON `PilotEnrollment` FOR EACH ROW
BEGIN
  IF OLD.activatedAt IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Started pilot grants must be retained'; END IF;
END;
