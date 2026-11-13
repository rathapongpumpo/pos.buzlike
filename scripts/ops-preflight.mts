import "dotenv/config";
import { db } from "../src/lib/db";
import { productionConfigIssues } from "../src/lib/production-config";
import { mysqlDatabase } from "../src/lib/database-dialect";
const issues = productionConfigIssues(process.env);
try {
  const settings = await db.releaseSettings.findUnique({
    where: { id: "platform" },
  });
  if (
    settings?.releaseMode !== "PRIVATE_PILOT" ||
    settings.checkoutMode !== "DISABLED"
  )
    issues.push("PRIVATE_PILOT_POLICY_REQUIRED");
  const campaign = await db.pilotCampaign.findUnique({
    where: { slug: "founders-5" },
  });
  if (!campaign || campaign.capacity !== 5 || campaign.durationDays !== 30)
    issues.push("PILOT_TERMS_MISMATCH");
  if (campaign?.status !== "DRAFT" && campaign?.status !== "PAUSED")
    issues.push("PREFLIGHT_REQUIRES_CAMPAIGN_NOT_OPEN");
  const control = await db.operationalControl.findUnique({
    where: { id: "platform" },
  });
  if (!control || control.outboundQuarantinedAt)
    issues.push("OUTBOUND_QUARANTINED");
  const demo = await db.user.count({
    where: {
      OR: [
        { email: { endsWith: ".local" } },
        { email: { endsWith: "@example.test" } },
      ],
    },
  });
  if (
    demo ||
    (await db.tenant.count({
      where: { slug: { in: ["buzlike-cafe", "demo", "demo-store"] } },
    }))
  )
    issues.push("DEMO_DATA_PRESENT");
  const [{ pending }] = mysqlDatabase()
    ? await db.$queryRaw<
        { pending: bigint }[]
      >`SELECT count(*) AS pending FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`
    : await db.$queryRaw<
        { pending: number }[]
      >`SELECT count(*)::int AS pending FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  if (pending) issues.push("MIGRATION_INCOMPLETE");
} catch {
  issues.push("DATABASE_NOT_READY");
} finally {
  await db.$disconnect();
}
console.log(
  JSON.stringify({
    ready: !issues.length,
    issues,
    message:
      "Read-only check; never changes admission, credentials, data or DNS",
  }),
);
if (issues.length) process.exitCode = 1;
