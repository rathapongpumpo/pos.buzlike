import { transactionLock } from "./database-dialect";
import { databaseClock, lockRow } from "./database-dialect";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, serial } from "./db";
import { assert } from "./errors";
import { PILOT_PRO_V1, pilotSnapshotSchema } from "./entitlements";
import { releasePolicy } from "./release-policy";
const DAY = 86400000;
export const pilotTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function databaseTime(tx: Prisma.TransactionClient) {
  return databaseClock(tx);
}
async function admin(tx: Prisma.TransactionClient, id: string) {
  const u = await tx.user.findUnique({ where: { id } });
  assert(u?.systemRole === "SUPER_ADMIN", "ไม่มีสิทธิ์จัดการโครงการ", 403);
}
export async function lockPilotCampaign(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const rows = await lockRow(tx, "PilotCampaign", id);
  assert(rows.length, "ไม่พบโครงการนำร่อง", 404);
  return tx.pilotCampaign.findUniqueOrThrow({ where: { id } });
}
async function lockedInvitation(
  tx: Prisma.TransactionClient,
  campaignId: string,
  id: string,
) {
  await lockRow(tx, "PilotInvitation", id, campaignId);
  const i = await tx.pilotInvitation.findUniqueOrThrow({ where: { id } });
  assert(i.campaignId === campaignId, "คำเชิญไม่ตรงโครงการ", 403);
  return i;
}
const log = (
  tx: Prisma.TransactionClient,
  campaignId: string,
  actorUserId: string | null,
  action: string,
  enrollmentId?: string,
  reason?: string,
) =>
  tx.pilotAuditEvent.create({
    data: { campaignId, actorUserId, action, enrollmentId, reason },
  });

export async function createPilotCampaign(actorId: string, slug: string) {
  z.string()
    .regex(/^[a-z0-9-]{3,80}$/)
    .parse(slug);
  return serial(async (tx) => {
    await admin(tx, actorId);
    const c = await tx.pilotCampaign.create({
      data: { slug, entitlementsSnapshot: { ...PILOT_PRO_V1 } },
    });
    await log(tx, c.id, actorId, "CAMPAIGN_CREATED");
    return c;
  });
}
export async function setCampaignStatus(
  actorId: string,
  campaignId: string,
  status: "OPEN" | "PAUSED" | "CLOSED",
  version: number,
  reason?: string,
) {
  if (reason !== undefined) z.string().trim().min(5).max(500).parse(reason);
  return serial(async (tx) => {
    await lockPilotCampaign(tx, campaignId);
    await admin(tx, actorId);
    const changed = await tx.pilotCampaign.updateMany({
      where: { id: campaignId, version },
      data: { status, version: { increment: 1 } },
    });
    assert(changed.count, "ข้อมูลโครงการเปลี่ยนแล้ว กรุณาโหลดใหม่", 409);
    await log(
      tx,
      campaignId,
      actorId,
      `CAMPAIGN_${status}`,
      undefined,
      reason?.trim(),
    );
    return tx.pilotCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  });
}
export async function issuePilotInvitation(
  actorId: string,
  campaignId: string,
  email: string,
) {
  const normalizedEmail = z.email().max(254).parse(email.trim().toLowerCase());
  // Generate once, outside the retryable callback. No email is sent by this foundation service.
  const token = randomBytes(32).toString("hex");
  const invitation = await serial(async (tx) => {
    await lockPilotCampaign(tx, campaignId);
    await admin(tx, actorId);
    const now = await databaseTime(tx);
    const i = await tx.pilotInvitation.create({
      data: {
        campaignId,
        normalizedEmail,
        tokenHash: pilotTokenHash(token),
        createdByUserId: actorId,
        createdAt: now,
        expiresAt: new Date(+now + 7 * DAY),
      },
    });
    await log(tx, campaignId, actorId, "INVITATION_ISSUED");
    return i;
  });
  return { invitation, token };
}
export async function reservePilot(ownerId: string, token: string) {
  assert(/^[a-f0-9]{64}$/.test(token), "คำเชิญไม่ถูกต้อง", 400);
  const preview = await db.pilotInvitation.findUnique({
    where: { tokenHash: pilotTokenHash(token) },
  });
  assert(preview, "คำเชิญใช้ไม่ได้แล้ว", 400);
  return reservePilotContext(
    ownerId,
    { invitationId: preview.id, tokenVersion: preview.tokenVersion },
    pilotTokenHash(token),
  );
}

// Only use with a verified, signed context or the user's server-stored pending invitation.
export async function reservePilotContext(
  ownerId: string,
  context: { invitationId: string; tokenVersion: number },
  expectedHash?: string,
) {
  const preview = await db.pilotInvitation.findUnique({
    where: { id: context.invitationId },
  });
  assert(preview, "คำเชิญใช้ไม่ได้แล้ว", 400);
  return serial(async (tx) => {
    const campaign = await lockPilotCampaign(tx, preview.campaignId);
    const invite = await lockedInvitation(tx, campaign.id, preview.id);
    await transactionLock(tx, ownerId);
    const now = await databaseTime(tx);
    const user = await tx.user.findUniqueOrThrow({ where: { id: ownerId } });
    assert(user.emailVerifiedAt, "กรุณายืนยันอีเมลก่อนรับสิทธิ์", 403);
    assert(
      user.email.trim().toLowerCase() === invite.normalizedEmail,
      "กรุณาใช้อีเมลที่ได้รับคำเชิญ",
      403,
    );
    assert(
      invite.tokenVersion === context.tokenVersion &&
        (!expectedHash || invite.tokenHash === expectedHash) &&
        !invite.revokedAt &&
        invite.expiresAt > now,
      "คำเชิญใช้ไม่ได้แล้ว",
      400,
    );
    assert(
      !invite.claimedByUserId || invite.claimedByUserId === ownerId,
      "คำเชิญถูกใช้แล้ว",
      409,
    );
    const existing = await tx.pilotEnrollment.findUnique({
      where: { campaignId_ownerId: { campaignId: campaign.id, ownerId } },
    });
    if (existing?.activatedAt) {
      assert(
        existing.invitationId === invite.id,
        "บัญชีนี้เคยใช้สิทธิ์แล้ว",
        409,
      );
      return existing;
    }
    if (existing?.status === "RESERVED" && existing.reservedUntil! > now) {
      assert(existing.invitationId === invite.id, "มีคำเชิญที่จองไว้แล้ว", 409);
      return existing;
    }
    assert(campaign.status === "OPEN", "โครงการยังไม่เปิดรับผู้เข้าร่วม", 409);
    const occupied = await tx.pilotEnrollment.count({
      where: {
        campaignId: campaign.id,
        OR: [
          { activatedAt: { not: null } },
          { status: "RESERVED", reservedUntil: { gt: now } },
        ],
      },
    });
    assert(
      occupied < campaign.capacity,
      "สิทธิ์นำร่องเต็มแล้ว กรุณาลงทะเบียนรอ",
      409,
    );
    await tx.pilotInvitation.update({
      where: { id: invite.id },
      data: { claimedByUserId: ownerId, claimedAt: invite.claimedAt ?? now },
    });
    const reservation = {
      invitationId: invite.id,
      status: "RESERVED",
      reservedUntil: new Date(
        Math.min(+now + campaign.reservationHours * 3600000, +invite.expiresAt),
      ),
      entitlementsSnapshot: pilotSnapshotSchema.parse(
        campaign.entitlementsSnapshot,
      ),
    };
    const e = existing
      ? await tx.pilotEnrollment.update({
          where: { id: existing.id },
          data: { ...reservation, version: { increment: 1 } },
        })
      : await tx.pilotEnrollment.create({
          data: { campaignId: campaign.id, ownerId, ...reservation },
        });
    await log(tx, campaign.id, ownerId, "RESERVED", e.id);
    return e;
  });
}

// Caller must own a transaction. This lets onboarding create the tenant and activate atomically.
export async function activatePilot(
  tx: Prisma.TransactionClient,
  ownerId: string,
  enrollmentId: string,
  tenantId: string,
) {
  const preview = await tx.pilotEnrollment.findUnique({
    where: { id: enrollmentId },
  });
  assert(
    preview && preview.ownerId === ownerId,
    "ไม่พบสิทธิ์นำร่องของบัญชีนี้",
    403,
  );
  await lockPilotCampaign(tx, preview.campaignId);
  const invite = await lockedInvitation(
    tx,
    preview.campaignId,
    preview.invitationId,
  );
  await transactionLock(tx, ownerId);
  const e = await tx.pilotEnrollment.findUniqueOrThrow({
    where: { id: preview.id },
  });
  if (e.activatedAt) {
    assert(e.tenantId === tenantId, "สิทธิ์นี้ใช้กับธุรกิจอื่นแล้ว", 409);
    return e;
  }
  const now = await databaseTime(tx);
  assert(
    e.status === "RESERVED" &&
      e.reservedUntil &&
      e.reservedUntil > now &&
      !invite.revokedAt &&
      invite.expiresAt > now,
    "การจองหมดอายุหรือถูกยกเลิก กรุณารับสิทธิ์ใหม่",
    409,
  );
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  assert(t.ownerId === ownerId, "ไม่ใช่เจ้าของธุรกิจนี้", 403);
  assert(
    t.planCode === "FREE_TRIAL" &&
      !t.isLifetime &&
      !t.stripeSubId &&
      !["READ_ONLY", "SUSPENDED"].includes(t.subscriptionStatus),
    "ไม่สามารถให้สิทธิ์นำร่องทับสมาชิกหรือคำสั่งระงับเดิม",
    409,
  );
  assert(
    !(await tx.pilotEnrollment.findFirst({
      where: { tenantId, activatedAt: { not: null } },
    })),
    "ธุรกิจนี้เคยได้รับสิทธิ์นำร่องแล้ว",
    409,
  );
  const result = await tx.pilotEnrollment.update({
    where: { id: e.id },
    data: {
      tenantId,
      status: "ACTIVE",
      activatedAt: now,
      endsAt: new Date(+now + 30 * DAY),
      version: { increment: 1 },
    },
  });
  await log(tx, e.campaignId, ownerId, "ACTIVATED", e.id);
  return result;
}
export async function extendPilot(
  actorId: string,
  id: string,
  version: number,
  endsAt: Date,
  reason: string,
) {
  assert(
    reason.trim().length >= 5 &&
      reason.length <= 500 &&
      Number.isFinite(+endsAt),
    "กรุณาระบุวันสิ้นสุดและเหตุผลให้ชัดเจน",
  );
  return serial(async (tx) => {
    const preview = await tx.pilotEnrollment.findUniqueOrThrow({
      where: { id },
    });
    await lockPilotCampaign(tx, preview.campaignId);
    await admin(tx, actorId);
    const e = await tx.pilotEnrollment.findUniqueOrThrow({ where: { id } });
    const now = await databaseTime(tx);
    assert(
      e.version === version &&
        e.activatedAt &&
        ["ACTIVE", "EXPIRED"].includes(e.status) &&
        +endsAt > Math.max(+e.endsAt!, +now),
      "ข้อมูลสิทธิ์เปลี่ยนแล้วหรือวันสิ้นสุดไม่ถูกต้อง",
      409,
    );
    const result = await tx.pilotEnrollment.update({
      where: { id },
      data: { endsAt, status: "ACTIVE", version: { increment: 1 } },
    });
    await tx.emailOutbox.updateMany({
      where: { pilotEnrollmentId: id, sentAt: null },
      data: { expiresAt: now },
    });
    await tx.pilotAuditEvent.create({
      data: {
        campaignId: e.campaignId,
        enrollmentId: id,
        actorUserId: actorId,
        action: "EXTENDED",
        reason: reason.trim(),
        before: { endsAt: e.endsAt!.toISOString(), version },
        after: { endsAt: endsAt.toISOString(), version: result.version },
      },
    });
    return result;
  });
}
export async function expirePilotReservations(campaignId: string) {
  return serial(async (tx) => {
    await lockPilotCampaign(tx, campaignId);
    const now = await databaseTime(tx);
    const rows = await tx.pilotEnrollment.findMany({
      where: {
        campaignId,
        status: "RESERVED",
        activatedAt: null,
        reservedUntil: { lte: now },
      },
    });
    for (const e of rows) {
      await tx.pilotEnrollment.update({
        where: { id: e.id },
        data: { status: "RELEASED", version: { increment: 1 } },
      });
      await log(tx, campaignId, null, "RESERVATION_RELEASED", e.id);
    }
    return rows.length;
  });
}

export async function preparePilotOnboarding(
  tx: Prisma.TransactionClient,
  ownerId: string,
  requestedId?: string,
) {
  const policy = await releasePolicy(tx);
  if (!requestedId && policy.releaseMode !== "PRIVATE_PILOT") return null;
  const e = requestedId
    ? await tx.pilotEnrollment.findUnique({ where: { id: requestedId } })
    : await tx.pilotEnrollment.findFirst({
        where: { ownerId, status: "RESERVED", activatedAt: null },
        orderBy: { createdAt: "desc" },
      });
  assert(
    e && e.ownerId === ownerId,
    "ขณะนี้รับเฉพาะผู้มีคำเชิญนำร่อง กรุณาลงทะเบียนรอ",
    403,
  );
  await lockPilotCampaign(tx, e.campaignId);
  await lockedInvitation(tx, e.campaignId, e.invitationId);
  await transactionLock(tx, ownerId);
  return e;
}
