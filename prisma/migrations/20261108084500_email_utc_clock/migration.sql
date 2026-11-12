-- Prisma DateTime columns are UTC timestamp without timezone.
ALTER TABLE "EmailOutbox" ALTER COLUMN "availableAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
-- Only normalize untouched, unclaimed pending jobs; leave retry schedules intact.
UPDATE "EmailOutbox" SET "availableAt"=LEAST("availableAt", CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE attempts=0 AND "sentAt" IS NULL AND "lockedAt" IS NULL;
