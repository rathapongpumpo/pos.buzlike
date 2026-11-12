import { encode, decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, serial } from "./db";
import { assert } from "./errors";
import { pilotTokenHash, databaseTime } from "./pilot";

const contextSchema = z.object({
  invitationId: z.string().min(1).max(128),
  tokenVersion: z.number().int().positive(),
});
export type PilotContext = z.infer<typeof contextSchema>;
const salt = "buzlike-pilot-context-v1";
export const pilotCookieName = () =>
  process.env.AUTH_URL?.startsWith("https://")
    ? "__Host-buzlike-pilot-context"
    : "buzlike-pilot-context";
export async function encodePilotContext(
  context: PilotContext,
  maxAge: number,
) {
  return encode({
    token: context,
    secret: process.env.AUTH_SECRET!,
    salt,
    maxAge,
  });
}
export async function decodePilotContext(value?: string) {
  if (!value) return null;
  try {
    const parsed = contextSchema.safeParse(
      await decode({ token: value, secret: process.env.AUTH_SECRET!, salt }),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export async function readPilotContext() {
  return decodePilotContext((await cookies()).get(pilotCookieName())?.value);
}
export async function validPilotInvitation(
  context: PilotContext,
  tx: Prisma.TransactionClient | typeof db = db,
) {
  const invite = await tx.pilotInvitation.findUnique({
    where: { id: context.invitationId },
    include: { campaign: true },
  });
  const now = await databaseTime(tx);
  assert(
    invite &&
      invite.tokenVersion === context.tokenVersion &&
      !invite.revokedAt &&
      invite.expiresAt > now,
    "คำเชิญหมดอายุหรือถูกยกเลิก กรุณาขอคำเชิญใหม่หรือลงทะเบียนรอ",
    410,
  );
  return invite;
}
export async function invitationFromToken(token: string) {
  assert(/^[a-f0-9]{64}$/.test(token), "คำเชิญไม่ถูกต้อง", 400);
  const invite = await db.pilotInvitation.findUnique({
    where: { tokenHash: pilotTokenHash(token) },
  });
  assert(invite, "คำเชิญใช้ไม่ได้แล้ว กรุณาขอคำเชิญใหม่หรือลงทะเบียนรอ", 410);
  return validPilotInvitation({
    invitationId: invite.id,
    tokenVersion: invite.tokenVersion,
  });
}
export async function bindPilotContext(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
  context: PilotContext | null,
  strict = false,
) {
  if (!context) return false;
  let invite;
  try {
    invite = await validPilotInvitation(context, tx);
  } catch (error) {
    if (strict) throw error;
    return false;
  }
  if (invite.normalizedEmail !== user.email.toLowerCase()) {
    assert(!strict, "กรุณาใช้อีเมลที่ได้รับคำเชิญ หรือกลับไปลงทะเบียนรอ", 403);
    return false;
  }
  assert(
    !invite.claimedByUserId || invite.claimedByUserId === user.id,
    "คำเชิญนี้ถูกใช้แล้ว",
    409,
  );
  await tx.user.update({
    where: { id: user.id },
    data: {
      pendingPilotInvitationId: invite.id,
      pendingPilotInvitationVersion: invite.tokenVersion,
    },
  });
  return true;
}
export async function bindCurrentPilotContext(user: {
  id: string;
  email: string;
}) {
  const context = await readPilotContext();
  if (context) await serial((tx) => bindPilotContext(tx, user, context));
}
export async function accountPilotContext(userId: string) {
  // A link opened in this browser takes priority; never silently substitute an old invite.
  const cookie = await readPilotContext();
  if (cookie) return cookie;
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      pendingPilotInvitationId: true,
      pendingPilotInvitationVersion: true,
    },
  });
  return user.pendingPilotInvitationId && user.pendingPilotInvitationVersion
    ? {
        invitationId: user.pendingPilotInvitationId,
        tokenVersion: user.pendingPilotInvitationVersion,
      }
    : null;
}
export async function pilotOverview() {
  const campaign = await db.pilotCampaign.findUnique({
    where: { slug: "founders-5" },
    select: { id: true, status: true, capacity: true, durationDays: true },
  });
  if (!campaign)
    return { status: "DRAFT", capacity: 5, durationDays: 30, remaining: 0 };
  const now = await databaseTime(db);
  const occupied = await db.pilotEnrollment.count({
    where: {
      campaignId: campaign.id,
      OR: [
        { activatedAt: { not: null } },
        { status: "RESERVED", reservedUntil: { gt: now } },
      ],
    },
  });
  return { ...campaign, remaining: Math.max(0, campaign.capacity - occupied) };
}
export const pilotDate = (date: Date | string) =>
  new Date(date).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
