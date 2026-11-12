BEGIN;
-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "notificationKind" TEXT,
ADD COLUMN     "pilotEnrollmentId" TEXT,
ADD COLUMN     "pilotEnrollmentVersion" INTEGER,
ADD COLUMN     "pilotTargetEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingPilotInvitationId" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "availableAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateTable
CREATE TABLE "ReleaseSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "releaseMode" TEXT NOT NULL DEFAULT 'LEGACY',
    "checkoutMode" TEXT NOT NULL DEFAULT 'PUBLIC',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "capacity" INTEGER NOT NULL DEFAULT 5,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "reservationHours" INTEGER NOT NULL DEFAULT 72,
    "entitlementProfile" TEXT NOT NULL DEFAULT 'PILOT_PRO_V1',
    "entitlementsSnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotInvitation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotEnrollment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedUntil" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "entitlementsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotWaitlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notifyConsentAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFeedback" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByStaffId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "optionalRating" INTEGER,
    "pageKey" TEXT NOT NULL,
    "deviceClass" TEXT NOT NULL,
    "severity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFeedbackHistory" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotFeedbackHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotAuditEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotCampaign_slug_key" ON "PilotCampaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PilotInvitation_tokenHash_key" ON "PilotInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "PilotInvitation_campaignId_normalizedEmail_idx" ON "PilotInvitation"("campaignId", "normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PilotInvitation_campaignId_id_key" ON "PilotInvitation"("campaignId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEnrollment_invitationId_key" ON "PilotEnrollment"("invitationId");

-- CreateIndex
CREATE INDEX "PilotEnrollment_campaignId_status_reservedUntil_idx" ON "PilotEnrollment"("campaignId", "status", "reservedUntil");

-- CreateIndex
CREATE INDEX "PilotEnrollment_status_endsAt_idx" ON "PilotEnrollment"("status", "endsAt");

-- CreateIndex
CREATE INDEX "PilotEnrollment_tenantId_activatedAt_idx" ON "PilotEnrollment"("tenantId", "activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEnrollment_campaignId_ownerId_key" ON "PilotEnrollment"("campaignId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEnrollment_campaignId_invitationId_key" ON "PilotEnrollment"("campaignId", "invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEnrollment_campaignId_tenantId_key" ON "PilotEnrollment"("campaignId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEnrollment_id_tenantId_key" ON "PilotEnrollment"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotWaitlistEntry_userId_key" ON "PilotWaitlistEntry"("userId");

-- CreateIndex
CREATE INDEX "PilotFeedback_tenantId_createdAt_idx" ON "PilotFeedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_status_createdAt_idx" ON "PilotFeedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotFeedback_tenantId_submittedByStaffId_requestKey_key" ON "PilotFeedback"("tenantId", "submittedByStaffId", "requestKey");

-- CreateIndex
CREATE INDEX "PilotAuditEvent_campaignId_createdAt_idx" ON "PilotAuditEvent"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "PilotAuditEvent_enrollmentId_createdAt_idx" ON "PilotAuditEvent"("enrollmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_id_ownerId_key" ON "Tenant"("id", "ownerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_pendingPilotInvitationId_fkey" FOREIGN KEY ("pendingPilotInvitationId") REFERENCES "PilotInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseSettings" ADD CONSTRAINT "ReleaseSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotInvitation" ADD CONSTRAINT "PilotInvitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PilotCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotInvitation" ADD CONSTRAINT "PilotInvitation_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotInvitation" ADD CONSTRAINT "PilotInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotEnrollment" ADD CONSTRAINT "PilotEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PilotCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotEnrollment" ADD CONSTRAINT "PilotEnrollment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotEnrollment" ADD CONSTRAINT "PilotEnrollment_campaignId_invitationId_fkey" FOREIGN KEY ("campaignId", "invitationId") REFERENCES "PilotInvitation"("campaignId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotEnrollment" ADD CONSTRAINT "PilotEnrollment_tenantId_ownerId_fkey" FOREIGN KEY ("tenantId", "ownerId") REFERENCES "Tenant"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotWaitlistEntry" ADD CONSTRAINT "PilotWaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_enrollmentId_tenantId_fkey" FOREIGN KEY ("enrollmentId", "tenantId") REFERENCES "PilotEnrollment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "StoreBranch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_tenantId_submittedByStaffId_fkey" FOREIGN KEY ("tenantId", "submittedByStaffId") REFERENCES "StaffMember"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedbackHistory" ADD CONSTRAINT "PilotFeedbackHistory_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "PilotFeedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedbackHistory" ADD CONSTRAINT "PilotFeedbackHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAuditEvent" ADD CONSTRAINT "PilotAuditEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PilotCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAuditEvent" ADD CONSTRAINT "PilotAuditEvent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "PilotEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAuditEvent" ADD CONSTRAINT "PilotAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_pilotEnrollmentId_fkey" FOREIGN KEY ("pilotEnrollmentId") REFERENCES "PilotEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Policy starts in compatibility mode. No customer is admitted or charged by this migration.
INSERT INTO "ReleaseSettings" (id, "releaseMode", "checkoutMode", version, "updatedAt")
VALUES ('platform', 'LEGACY', 'PUBLIC', 0, (clock_timestamp() AT TIME ZONE 'UTC'));
ALTER TABLE "ReleaseSettings" ADD CONSTRAINT "ReleaseSettings_values" CHECK (
 id='platform' AND "releaseMode" IN ('LEGACY','PRIVATE_PILOT','COMMERCIAL')
 AND "checkoutMode" IN ('DISABLED','EXISTING_ONLY','PUBLIC')
 AND ("releaseMode" <> 'PRIVATE_PILOT' OR "checkoutMode"='DISABLED') AND version>=0);
ALTER TABLE "PilotCampaign" ADD CONSTRAINT "PilotCampaign_rules" CHECK (
 status IN ('DRAFT','OPEN','PAUSED','CLOSED') AND capacity BETWEEN 1 AND 5
 AND "durationDays"=30 AND "reservationHours"=72 AND "entitlementProfile"='PILOT_PRO_V1'
 AND "entitlementsSnapshot"='{"profile":"PILOT_PRO_V1","maxBranches":3,"maxTerminals":-1,"maxProducts":-1,"maxStaff":-1,"enableKds":true,"enableQrOrder":true,"enableRecipeBom":true,"enableExport":true}'::jsonb);
ALTER TABLE "PilotInvitation" ADD CONSTRAINT "PilotInvitation_rules" CHECK (
 "normalizedEmail"=lower(btrim("normalizedEmail")) AND length("normalizedEmail") BETWEEN 3 AND 254
 AND "tokenHash" ~ '^[a-f0-9]{64}$' AND "tokenVersion">0 AND "expiresAt">"createdAt"
 AND (("claimedByUserId" IS NULL)=("claimedAt" IS NULL)));
ALTER TABLE "PilotEnrollment" ADD CONSTRAINT "PilotEnrollment_states" CHECK (
 version>0 AND status IN ('RESERVED','ACTIVE','EXPIRED','REVOKED','CONVERTED','RELEASED') AND
 (("activatedAt" IS NULL AND "tenantId" IS NULL AND "endsAt" IS NULL AND status IN ('RESERVED','RELEASED') AND "reservedUntil" IS NOT NULL)
 OR ("activatedAt" IS NOT NULL AND "tenantId" IS NOT NULL AND "endsAt">"activatedAt" AND status IN ('ACTIVE','EXPIRED','REVOKED','CONVERTED'))));
CREATE UNIQUE INDEX "PilotEnrollment_one_active_tenant" ON "PilotEnrollment"("tenantId") WHERE status='ACTIVE';
ALTER TABLE "PilotWaitlistEntry" ADD CONSTRAINT "PilotWaitlist_status" CHECK (status IN ('WAITING','INVITED','WITHDRAWN'));
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_fields" CHECK (
 category IN ('BUG','USABILITY','FEATURE','GENERAL') AND status IN ('NEW','TRIAGED','IN_PROGRESS','RESOLVED')
 AND (severity IS NULL OR severity IN ('P0','P1','P2','P3')) AND ("optionalRating" IS NULL OR "optionalRating" BETWEEN 1 AND 5)
 AND length(btrim(message)) BETWEEN 1 AND 2000 AND length("pageKey") BETWEEN 1 AND 60
 AND "deviceClass" IN ('MOBILE','TABLET','DESKTOP','UNKNOWN'));
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_pilot_reference" CHECK (
 ("pilotEnrollmentId" IS NULL AND "pilotEnrollmentVersion" IS NULL AND "pilotTargetEndsAt" IS NULL)
 OR ("pilotEnrollmentId" IS NOT NULL AND "pilotEnrollmentVersion">0 AND "pilotTargetEndsAt" IS NOT NULL AND "notificationKind" IS NOT NULL));

CREATE FUNCTION pilot_campaign_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.capacity,NEW."durationDays",NEW."reservationHours",NEW."entitlementProfile",NEW."entitlementsSnapshot")
 IS DISTINCT FROM (OLD.capacity,OLD."durationDays",OLD."reservationHours",OLD."entitlementProfile",OLD."entitlementsSnapshot")
 AND EXISTS(SELECT 1 FROM "PilotInvitation" WHERE "campaignId"=OLD.id) THEN
   RAISE EXCEPTION 'Pilot campaign terms already issued' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PilotCampaign_frozen_terms" BEFORE UPDATE ON "PilotCampaign" FOR EACH ROW EXECUTE FUNCTION pilot_campaign_rules();

CREATE FUNCTION pilot_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE campaign "PilotCampaign"; used_count integer; current_time_utc timestamp; identity_ok boolean;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD."activatedAt" IS NOT NULL THEN RAISE EXCEPTION 'Started pilot grants must be retained' USING ERRCODE='23514'; END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW."campaignId"<>OLD."campaignId" OR NEW."ownerId"<>OLD."ownerId" THEN
     RAISE EXCEPTION 'Pilot identity cannot be reassigned' USING ERRCODE='23514';
   END IF;
   IF OLD."activatedAt" IS NOT NULL AND
     (NEW."tenantId",NEW."invitationId",NEW."activatedAt",NEW."entitlementsSnapshot") IS DISTINCT FROM
     (OLD."tenantId",OLD."invitationId",OLD."activatedAt",OLD."entitlementsSnapshot") THEN
     RAISE EXCEPTION 'Started pilot grant is immutable' USING ERRCODE='23514';
   END IF;
   IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Pilot version must advance' USING ERRCODE='23514'; END IF;
 END IF;
 -- Updating the campaign serializes writes and makes stale Serializable snapshots retry.
 UPDATE "PilotCampaign" SET version=version+1 WHERE id=NEW."campaignId" RETURNING * INTO campaign;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing campaign' USING ERRCODE='23503'; END IF;
 current_time_utc := clock_timestamp() AT TIME ZONE 'UTC';
 IF (TG_OP='INSERT' OR OLD."activatedAt" IS NULL) AND (NEW.status='RESERVED' OR NEW."activatedAt" IS NOT NULL) THEN
   SELECT EXISTS(SELECT 1 FROM "PilotInvitation" i JOIN "User" u ON u.id=NEW."ownerId"
     WHERE i.id=NEW."invitationId" AND i."campaignId"=NEW."campaignId"
       AND i."claimedByUserId"=u.id AND i."claimedAt" IS NOT NULL
       AND i."normalizedEmail"=lower(btrim(u.email)) AND u."emailVerifiedAt" IS NOT NULL
       AND i."revokedAt" IS NULL AND i."expiresAt">current_time_utc) INTO identity_ok;
   IF NOT identity_ok THEN RAISE EXCEPTION 'Unverified or invalid pilot invitation' USING ERRCODE='23514'; END IF;
   IF NEW."entitlementsSnapshot" IS DISTINCT FROM campaign."entitlementsSnapshot" THEN
     RAISE EXCEPTION 'Pilot profile does not match' USING ERRCODE='23514';
   END IF;
   IF NEW.status='RESERVED' AND (campaign.status<>'OPEN' OR NEW."reservedUntil"<=current_time_utc OR NEW."reservedUntil">current_time_utc+interval '72 hours') THEN
     RAISE EXCEPTION 'Invalid pilot reservation' USING ERRCODE='23514';
   END IF;
   IF NEW."activatedAt" IS NOT NULL THEN
     IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Reserve before activating' USING ERRCODE='23514'; END IF;
     IF OLD.status<>'RESERVED' OR OLD."reservedUntil"<=current_time_utc OR NEW."activatedAt">current_time_utc
       OR NEW."endsAt"<>NEW."activatedAt"+interval '30 days' THEN
       RAISE EXCEPTION 'Pilot reservation expired or period invalid' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 SELECT count(*) INTO used_count FROM "PilotEnrollment" e WHERE e."campaignId"=NEW."campaignId" AND e.id<>NEW.id
   AND (e."activatedAt" IS NOT NULL OR (e.status='RESERVED' AND e."reservedUntil">current_time_utc));
 IF used_count + (CASE WHEN NEW."activatedAt" IS NOT NULL OR (NEW.status='RESERVED' AND NEW."reservedUntil">current_time_utc) THEN 1 ELSE 0 END) > campaign.capacity THEN
   RAISE EXCEPTION 'Pilot capacity exceeded' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PilotEnrollment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PilotEnrollment" FOR EACH ROW EXECUTE FUNCTION pilot_enrollment_guard();
COMMIT;
