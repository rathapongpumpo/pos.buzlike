import "dotenv/config";
import { db } from "../src/lib/db";
import { initializeEmptyPilot } from "../src/lib/pilot-initialization";
import { productionConfigIssues } from "../src/lib/production-config";
if (!process.argv.includes("--empty-database"))
  throw Error(
    "Use --empty-database for a new, empty production/staging database only",
  );
const issues = productionConfigIssues(process.env);
if (issues.length)
  throw Error("Resolve production configuration first: " + issues.join(","));
try {
  if (!process.env.SEED_ADMIN_EMAIL)
    throw Error(
      "SEED_ADMIN_EMAIL must explicitly identify the configured platform administrator",
    );
  const actor = await db.user.findFirst({
    where: {
      email: process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase(),
      systemRole: "SUPER_ADMIN",
    },
  });
  if (!actor)
    throw Error(
      "Seed the catalog and explicitly configured administrator with SEED_DEMO=false first",
    );
  console.log(JSON.stringify(await initializeEmptyPilot(actor.id)));
} finally {
  await db.$disconnect();
}
