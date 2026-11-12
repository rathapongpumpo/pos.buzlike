CREATE TABLE "GoogleIdentity" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoogleIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleIdentity_subject_key" ON "GoogleIdentity"("subject");
CREATE UNIQUE INDEX "GoogleIdentity_userId_key" ON "GoogleIdentity"("userId");
CREATE TABLE "GoogleLinkChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleLinkChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoogleLinkChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleLinkChallenge_tokenHash_key" ON "GoogleLinkChallenge"("tokenHash");
CREATE INDEX "GoogleLinkChallenge_userId_expiresAt_idx" ON "GoogleLinkChallenge"("userId", "expiresAt");
