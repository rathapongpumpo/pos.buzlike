CREATE TABLE "WorkerHeartbeat" (
 "name" TEXT PRIMARY KEY,
 "lastAttemptAt" TIMESTAMP(3) NOT NULL,
 "lastSuccessAt" TIMESTAMP(3),
 "lastFailureAt" TIMESTAMP(3),
 "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
 "state" TEXT NOT NULL,
 CONSTRAINT "WorkerHeartbeat_name" CHECK ("name" IN ('email','pilot','monitor')),
 CONSTRAINT "WorkerHeartbeat_state" CHECK ("state" IN ('RUNNING','OK','ERROR','DISABLED')),
 CONSTRAINT "WorkerHeartbeat_failures" CHECK ("consecutiveFailures" >= 0)
);
CREATE TABLE "OperationalControl" (
 "id" TEXT PRIMARY KEY DEFAULT 'platform',
 "outboundQuarantinedAt" TIMESTAMP(3),
 CONSTRAINT "OperationalControl_singleton" CHECK ("id"='platform')
);
INSERT INTO "OperationalControl" ("id") VALUES ('platform');
