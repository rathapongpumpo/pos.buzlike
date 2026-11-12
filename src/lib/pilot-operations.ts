import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, serial } from "./db";
import { assert } from "./errors";
import { databaseTime, lockPilotCampaign, pilotTokenHash } from "./pilot";
import { appLink, queueAccountMail } from "./email-outbox";
import { effectiveTenant } from "./entitlements";
const DAY = 86400000;
export async function pilotAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const user = await tx.user.findUnique({ where: { id: actorId } });
  assert(user?.systemRole === "SUPER_ADMIN", "ไม่มีสิทธิ์จัดการโครงการ", 403);
}
export async function managePilotInvitation(
  actorId: string,
  input: {
    action: "invite" | "resend" | "revokeInvitation";
    campaignId: string;
    requestKey?: string;
    email?: string;
    id?: string;
    version?: number;
    reason: string;
  },
) {
  const token = randomBytes(32).toString("hex");
  const reason = z.string().trim().min(5).max(500).parse(input.reason);
  return serial(async (tx) => {
    const campaign = await lockPilotCampaign(tx, input.campaignId);
    await pilotAdmin(tx, actorId);
    const now = await databaseTime(tx);
    let invitation;
    if (input.action === "invite") {
      const key = z.uuid().parse(input.requestKey);
      const email = z.email().max(254).parse(input.email?.trim().toLowerCase());
      const id = `pilot-${key}`;
      const existing = await tx.pilotInvitation.findUnique({ where: { id } });
      if (existing) {
        assert(
          existing.createdByUserId === actorId &&
            existing.campaignId === campaign.id &&
            existing.normalizedEmail === email,
          "รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว",
          409,
        );
        return {
          id: existing.id,
          tokenVersion: existing.tokenVersion,
          queued: true,
        };
      }
      assert(campaign.status === "OPEN", "เปิดโครงการก่อนส่งคำเชิญ", 409);
      const duplicate = await tx.pilotInvitation.count({
        where: {
          campaignId: campaign.id,
          normalizedEmail: email,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      assert(!duplicate, "มีคำเชิญที่ใช้งานได้แล้ว กรุณาเลือกส่งใหม่", 409);
      invitation = await tx.pilotInvitation.create({
        data: {
          id,
          campaignId: campaign.id,
          normalizedEmail: email,
          tokenHash: pilotTokenHash(token),
          createdByUserId: actorId,
          createdAt: now,
          expiresAt: new Date(+now + 7 * DAY),
        },
      });
    } else {
      const old = await tx.pilotInvitation.findFirst({
        where: { id: input.id, campaignId: campaign.id },
      });
      assert(old, "ไม่พบคำเชิญ", 404);
      assert(
        old.tokenVersion === input.version && !old.revokedAt,
        "คำเชิญเปลี่ยนแล้ว กรุณาโหลดใหม่",
        409,
      );
      const grant = await tx.pilotEnrollment.findUnique({
        where: { invitationId: old.id },
      });
      assert(
        !grant?.activatedAt,
        "เริ่มใช้แล้ว กรุณาจัดการที่สิทธิ์ของร้าน",
        409,
      );
      if (input.action === "resend")
        assert(campaign.status === "OPEN", "เปิดโครงการก่อนส่งคำเชิญ", 409);
      // Release the old claim before rotating; the database revalidates invitations on enrollment updates.
      if (grant?.status === "RESERVED")
        await tx.pilotEnrollment.update({
          where: { id: grant.id },
          data: { status: "RELEASED", version: { increment: 1 } },
        });
      await tx.emailOutbox.updateMany({
        where: {
          dedupeKey: { startsWith: `pilot-invite:${old.id}:` },
          sentAt: null,
        },
        data: { expiresAt: now },
      });
      invitation = await tx.pilotInvitation.update({
        where: { id: old.id },
        data: {
          tokenVersion: { increment: 1 },
          tokenHash: pilotTokenHash(token),
          ...(input.action === "resend"
            ? {
                expiresAt: new Date(+now + 7 * DAY),
                claimedAt: null,
                claimedByUserId: null,
              }
            : { revokedAt: now }),
        },
      });
    }
    if (input.action !== "revokeInvitation")
      await queueAccountMail(tx, {
        to: invitation.normalizedEmail,
        subject: "คำเชิญทดลอง BUZLIKE POS Pro ฟรี 30 วัน",
        text: `คุณได้รับเชิญให้ทดลอง BUZLIKE POS Pro ฟรี 30 วัน เริ่มนับเมื่อตั้งร้านหรือเลือกใช้กับร้านเดิมสำเร็จ ไม่มีการเรียกเก็บเงินอัตโนมัติ\n\n${appLink(`/pilot/invite?token=${token}`)}\n\nลิงก์มีอายุถึง ${invitation.expiresAt.toISOString()} เฉพาะอีเมลนี้ การจองขึ้นอยู่กับจำนวนสิทธิ์ที่เหลือ หากได้รับลิงก์ใหม่ ลิงก์เดิมจะใช้ไม่ได้`,
        dedupeKey: `pilot-invite:${invitation.id}:${invitation.tokenVersion}`,
        expiresAt: invitation.expiresAt,
      });
    await tx.pilotAuditEvent.create({
      data: {
        campaignId: campaign.id,
        actorUserId: actorId,
        action: `INVITATION_${input.action.toUpperCase()}`,
        reason,
        after: {
          invitationId: invitation.id,
          tokenVersion: invitation.tokenVersion,
        },
      },
    });
    return {
      id: invitation.id,
      tokenVersion: invitation.tokenVersion,
      queued: input.action !== "revokeInvitation",
    };
  });
}
export async function revokePilot(
  actorId: string,
  id: string,
  version: number,
  reason: string,
) {
  z.string().trim().min(5).max(500).parse(reason);
  return serial(async (tx) => {
    const preview = await tx.pilotEnrollment.findUniqueOrThrow({
      where: { id },
    });
    await lockPilotCampaign(tx, preview.campaignId);
    await pilotAdmin(tx, actorId);
    const grant = await tx.pilotEnrollment.findUniqueOrThrow({ where: { id } });
    assert(
      grant.version === version &&
        grant.activatedAt &&
        ["ACTIVE", "EXPIRED"].includes(grant.status),
      "สิทธิ์เปลี่ยนแล้ว กรุณาโหลดใหม่",
      409,
    );
    const now = await databaseTime(tx);
    const result = await tx.pilotEnrollment.update({
      where: { id },
      data: { status: "REVOKED", version: { increment: 1 } },
    });
    await tx.emailOutbox.updateMany({
      where: { pilotEnrollmentId: id, sentAt: null },
      data: { expiresAt: now },
    });
    await tx.pilotAuditEvent.create({
      data: {
        campaignId: grant.campaignId,
        enrollmentId: id,
        actorUserId: actorId,
        action: "REVOKED",
        reason: reason.trim(),
        before: { status: grant.status, version },
        after: { status: result.status, version: result.version },
      },
    });
    return { id, status: result.status, version: result.version };
  });
}
// Queue only: sending is deliberately delegated to the existing SMTP worker.
export async function runPilotMaintenance() {
  const campaigns = await db.pilotCampaign.findMany({ select: { id: true } });
  let released = 0,
    expired = 0,
    queued = 0;
  for (const campaign of campaigns) {
    const result = await serial(async (tx) => {
      await lockPilotCampaign(tx, campaign.id);
      const now = await databaseTime(tx);
      let released = 0,
        expired = 0,
        queued = 0;
      const rows = await tx.pilotEnrollment.findMany({
        where: {
          campaignId: campaign.id,
          status: { in: ["RESERVED", "ACTIVE", "EXPIRED"] },
        },
        include: { owner: true, tenant: true },
      });
      for (let grant of rows) {
        if (grant.status === "RESERVED") {
          if (grant.reservedUntil && grant.reservedUntil <= now) {
            await tx.pilotEnrollment.update({
              where: { id: grant.id },
              data: { status: "RELEASED", version: { increment: 1 } },
            });
            await tx.pilotAuditEvent.create({
              data: {
                campaignId: campaign.id,
                enrollmentId: grant.id,
                action: "RESERVATION_RELEASED",
              },
            });
            released++;
          }
          continue;
        }
        if (!grant.endsAt || !grant.tenant) continue;
        if (grant.endsAt <= now && grant.status === "ACTIVE") {
          const updated = await tx.pilotEnrollment.update({
            where: { id: grant.id },
            data: { status: "EXPIRED", version: { increment: 1 } },
          });
          grant = { ...grant, ...updated };
          await tx.pilotAuditEvent.create({
            data: {
              campaignId: campaign.id,
              enrollmentId: grant.id,
              action: "EXPIRED",
              after: {
                endsAt: grant.endsAt!.toISOString(),
                version: grant.version,
              },
            },
          });
          expired++;
        }
        if (
          (await effectiveTenant(grant.tenant!, tx, +now)).entitlement
            .source !== "PILOT"
        )
          continue;
        const days = (+grant.endsAt! - +now) / DAY;
        const kind =
          days <= 0
            ? "EXPIRED"
            : days <= 1
              ? "DAY_1"
              : days <= 3
                ? "DAY_3"
                : days <= 7
                  ? "DAY_7"
                  : null;
        if (!kind) continue;
        const dedupeKey = `pilot-reminder:${grant.id}:${grant.version}:${kind}`;
        if (await tx.emailOutbox.findUnique({ where: { dedupeKey } })) continue;
        const until =
          days <= 0
            ? new Date(+now + 7 * DAY)
            : new Date(
                +grant.endsAt! -
                  (kind === "DAY_7" ? 3 : kind === "DAY_3" ? 1 : 0) * DAY,
              );
        const endLabel = grant.endsAt!.toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        });
        await tx.emailOutbox.create({
          data: {
            pilotEnrollmentId: grant.id,
            pilotEnrollmentVersion: grant.version,
            pilotTargetEndsAt: grant.endsAt,
            notificationKind: kind,
            dedupeKey,
            tenantId: grant.tenantId,
            userId: grant.ownerId,
            to: grant.owner.email,
            subject:
              days <= 0
                ? "สิทธิ์นำร่อง BUZLIKE POS สิ้นสุดแล้ว"
                : `สิทธิ์นำร่อง BUZLIKE POS ใกล้สิ้นสุด (${Math.ceil(days)} วัน)`,
            text: `ร้าน ${grant.tenant!.name}\nสิทธิ์ Pro นำร่องสิ้นสุด ${endLabel} (เวลาประเทศไทย) ไม่มีการเรียกเก็บเงินอัตโนมัติ\n${days <= 0 ? "ระบบเข้าสู่โหมดอ่านข้อมูลเดิม" : "กรุณาเตรียมข้อมูลและแจ้งฟีดแบ็กก่อนสิ้นสุดสิทธิ์"}\n${appLink(`/${grant.tenant!.slug}/feedback`)}\nข้อมูล ณ ${now.toISOString()} โปรดดูวันสิ้นสุดปัจจุบันในแอป หากมีการขยายสิทธิ์ภายหลัง`,
            expiresAt: until,
          },
        });
        queued++;
      }
      return { released, expired, queued };
    });
    released += result.released;
    expired += result.expired;
    queued += result.queued;
  }
  return { released, expired, queued };
}
