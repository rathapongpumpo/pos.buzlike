import { z } from "zod";
import { db } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { requirePilotAdmin } from "@/lib/pilot-admin-http";
import { managePilotInvitation, revokePilot } from "@/lib/pilot-operations";
import { extendPilot, setCampaignStatus } from "@/lib/pilot";
const reason = z.string().trim().min(5).max(500);
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    campaignId: z.string().min(1),
    email: z.email().max(254),
    requestKey: z.uuid(),
    reason,
  }),
  z.object({
    action: z.enum(["resend", "revokeInvitation"]),
    campaignId: z.string().min(1),
    id: z.string().min(1),
    version: z.number().int().positive(),
    reason,
  }),
  z.object({
    action: z.enum(["extend", "revoke"]),
    id: z.string().min(1),
    version: z.number().int().positive(),
    endsAt: z.iso.datetime().optional(),
    reason,
  }),
  z.object({
    action: z.literal("campaign"),
    id: z.string().min(1),
    version: z.number().int().nonnegative(),
    status: z.enum(["OPEN", "PAUSED", "CLOSED"]),
    reason,
  }),
]);
export async function GET(req: Request) {
  return respond(async () => {
    await requirePilotAdmin(req);
    const campaigns = await db.pilotCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        invitations: {
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            normalizedEmail: true,
            tokenVersion: true,
            expiresAt: true,
            revokedAt: true,
            claimedAt: true,
          },
        },
        enrollments: {
          include: {
            owner: { select: { email: true } },
            tenant: {
              select: {
                name: true,
                slug: true,
                branches: {
                  select: {
                    _count: { select: { orders: true, shifts: true } },
                    orders: {
                      where: { status: { in: ["PAID", "REFUNDED"] } },
                      orderBy: { createdAt: "asc" },
                      take: 1,
                      select: { createdAt: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        auditEvents: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { email: true } } },
        },
      },
    });
    const [waiting, pendingMail, failedMail, feedbackOpen] = await Promise.all([
      db.pilotWaitlistEntry.count({
        where: { status: "WAITING", withdrawnAt: null },
      }),
      db.emailOutbox.count({
        where: {
          sentAt: null,
          failedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      db.emailOutbox.count({
        where: {
          sentAt: null,
          failedAt: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      db.pilotFeedback.count({ where: { status: { not: "RESOLVED" } } }),
    ]);
    return { campaigns, waiting, pendingMail, failedMail, feedbackOpen };
  });
}
export async function POST(req: Request) {
  return respond(async () => {
    const user = await requirePilotAdmin(req, true),
      b = inputSchema.parse(await req.json());
    if (b.action === "campaign")
      return setCampaignStatus(user.id, b.id, b.status, b.version, b.reason);
    if (b.action === "extend") {
      assert(b.endsAt, "กรุณาระบุวันสิ้นสุด");
      const end = new Date(b.endsAt);
      assert(
        +end <= Date.now() + 90 * 86400000,
        "ขยายสิทธิ์ได้ไม่เกิน 90 วันนับจากวันนี้",
      );
      const grant = await extendPilot(user.id, b.id, b.version, end, b.reason);
      return { id: grant.id, version: grant.version, endsAt: grant.endsAt };
    }
    if (b.action === "revoke")
      return revokePilot(user.id, b.id, b.version, b.reason);
    return managePilotInvitation(
      user.id,
      b as Parameters<typeof managePilotInvitation>[1],
    );
  });
}
