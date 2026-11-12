import { serial } from "./db";
import { assert } from "./errors";
import { PILOT_PRO_V1 } from "./entitlements";
export async function initializeEmptyPilot(actorId: string) {
  return serial(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pilot-initialization'))`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    assert(
      actor?.systemRole === "SUPER_ADMIN",
      "Platform administrator required",
      403,
    );
    assert(
      !(await tx.tenant.count()) &&
        !(await tx.user.count({
          where: { systemRole: { not: "SUPER_ADMIN" } },
        })) &&
        !(await tx.saasPayment.count()) &&
        !(await tx.pilotInvitation.count()) &&
        !(await tx.pilotEnrollment.count()),
      "Initialization requires an empty customer database; existing data is never converted",
      409,
    );
    const existing = await tx.pilotCampaign.findUnique({
      where: { slug: "founders-5" },
    });
    assert(
      !existing || existing.status === "DRAFT",
      "Initialization never changes an opened campaign",
      409,
    );
    const campaign =
      existing ??
      (await tx.pilotCampaign.create({
        data: { slug: "founders-5", entitlementsSnapshot: { ...PILOT_PRO_V1 } },
      }));
    const release = await tx.releaseSettings.findUniqueOrThrow({
      where: { id: "platform" },
    });
    if (
      release.releaseMode !== "PRIVATE_PILOT" ||
      release.checkoutMode !== "DISABLED"
    ) {
      await tx.releaseSettings.update({
        where: { id: "platform" },
        data: {
          releaseMode: "PRIVATE_PILOT",
          checkoutMode: "DISABLED",
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      await tx.pilotAuditEvent.create({
        data: {
          campaignId: campaign.id,
          actorUserId: actorId,
          action: "PILOT_SERVER_PREPARED",
          reason:
            "Empty customer database initialized; admission remains DRAFT and checkout disabled",
        },
      });
    }
    return {
      campaign: campaign.slug,
      status: campaign.status,
      release: "PRIVATE_PILOT",
      checkout: "DISABLED",
    };
  });
}
