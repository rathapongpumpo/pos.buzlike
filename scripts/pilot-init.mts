import "dotenv/config";
import { db, serial } from "../src/lib/db";
import { PILOT_PRO_V1 } from "../src/lib/entitlements";
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Draft initialization is restricted to the local workspace");
try {
  const campaign = await serial(async (tx) => {
    const existing = await tx.pilotCampaign.findUnique({
      where: { slug: "founders-5" },
    });
    if (existing) return existing;
    const actor = await tx.user.findFirst({
      where: { systemRole: "SUPER_ADMIN" },
      select: { id: true },
    });
    if (!actor)
      throw new Error(
        "A platform administrator is required before draft initialization",
      );
    const c = await tx.pilotCampaign.create({
      data: { slug: "founders-5", entitlementsSnapshot: { ...PILOT_PRO_V1 } },
    });
    await tx.pilotAuditEvent.create({
      data: {
        campaignId: c.id,
        actorUserId: actor.id,
        action: "CAMPAIGN_CREATED",
        reason: "Phase A local draft; no admission enabled",
      },
    });
    return c;
  });
  console.log(
    JSON.stringify({
      campaign: campaign.slug,
      status: campaign.status,
      capacity: campaign.capacity,
      durationDays: campaign.durationDays,
      release: (
        await db.releaseSettings.findUniqueOrThrow({
          where: { id: "platform" },
        })
      ).releaseMode,
    }),
  );
} finally {
  await db.$disconnect();
}
