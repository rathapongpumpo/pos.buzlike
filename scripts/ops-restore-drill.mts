import "dotenv/config";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { databaseFingerprint, sqlIdentifier } from "./lib/database-fingerprint";
import { fileFingerprint } from "./lib/file-fingerprint";
const backupArg = process.argv[process.argv.indexOf("--backup") + 1];
if (!process.argv.includes("--backup") || !backupArg)
  throw Error("Usage: ops-restore-drill --backup data/backups/pre-pilot-d-...");
const sourceUrl = new URL(process.env.DATABASE_URL!);
assert(
  ["localhost", "127.0.0.1"].includes(sourceUrl.hostname),
  "Local drill only",
);
const backupRoot = await realpath(path.resolve("data/backups")),
  source = await realpath(path.resolve(backupArg));
assert(
  source.startsWith(backupRoot + path.sep),
  "Backup must be inside workspace data/backups",
);
assert.equal(
  (await readFile(path.join(source, "PG_VERSION"), "utf8")).trim(),
  "17",
);
const manifest = JSON.parse(await readFile(source + ".manifest.json", "utf8"));
assert.equal(manifest.kind, "local-clean-shutdown");
const port = 55433;
assert.notEqual(Number(sourceUrl.port), port);
await new Promise<void>((resolve, reject) => {
  const check = createServer();
  check.once("error", reject);
  check.listen(port, "127.0.0.1", () => check.close(() => resolve()));
});
const directory = path.resolve("data/restore-drills"),
  target = path.join(directory, new Date().toISOString().replace(/[:.]/g, "-"));
assert(
  target.startsWith(directory + path.sep) &&
    !target.startsWith(path.resolve("data/postgres") + path.sep),
);
await mkdir(directory, { recursive: true });
await cp(source, target, { recursive: true, errorOnExist: true, force: false });
const restoredSlips=target+".slips";
if(Object.keys(manifest.slips??{}).length)await cp(source+".slips",restoredSlips,{recursive:true,errorOnExist:true,force:false});
assert.deepEqual(await fileFingerprint(restoredSlips),manifest.slips??{},"Private slip file hashes differ");
await mkdir("output/pilot-d", { recursive: true });
const ctl = path.resolve(
    "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",
  ),
  url = new URL(sourceUrl);
url.port = String(port);
const restored = new PrismaClient({ datasourceUrl: url.href });
let started = false;
try {
  execFileSync(
    ctl,
    [
      "start",
      "-D",
      target,
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-l",
      path.resolve("output/pilot-d/restore-postgres.log"),
      "-w",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  started = true;
  const actual = await databaseFingerprint(restored);
  assert.deepEqual(
    actual,
    manifest.fingerprint,
    "Restored database rows/checksums differ",
  );
  for (const schema of Object.keys(actual)) {
    assert(
      actual[schema].OperationalControl,
      "Restore backup must include quarantine migration",
    );
    await restored.$executeRawUnsafe(
      `UPDATE ${sqlIdentifier(schema)}."OperationalControl" SET "outboundQuarantinedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE id='platform'`,
    );
  }
  let pilotProbe: Record<string, unknown> | null = null;
  if (process.argv.includes("--verify-pilot")) {
    const schema = process.argv[process.argv.indexOf("--verify-pilot") + 1];
    assert(
      /^qa_pilot_d_restore_[a-f0-9]+$/.test(schema) && actual[schema],
      "Unexpected fixture schema",
    );
    const fixtureUrl = new URL(url);
    fixtureUrl.searchParams.set("schema", schema);
    process.env.DATABASE_URL = fixtureUrl.href;
    const { db } = await import("../src/lib/db"),
      pilot = await import("../src/lib/pilot"),
      { effectiveTenant } = await import("../src/lib/entitlements"),
      { flushEmailOutbox } = await import("../src/lib/email-outbox");
    try {
      const campaign = await db.pilotCampaign.findUniqueOrThrow({
          where: { slug: "restore-drill" },
        }),
        grants = await db.pilotEnrollment.findMany({
          where: { campaignId: campaign.id },
          include: { tenant: true },
        });
      assert.equal(grants.length, 5);
      let active = 0,
        readOnly = 0;
      for (const grant of grants)
        if (grant.tenant) {
          const view = await effectiveTenant(grant.tenant);
          assert.equal(view.entitlement.source, "PILOT");
          if (view.entitlement.state === "ACTIVE") active++;
          else {
            assert.equal(view.entitlement.state, "READ_ONLY");
            readOnly++;
          }
        }
      assert.equal(active, 3);
      assert.equal(readOnly, 1);
      const actor = await db.user.findFirstOrThrow({
          where: { systemRole: "SUPER_ADMIN" },
        }),
        owner = await db.user.create({
          data: {
            email: "sixth-restore@example.test",
            fullName: "Restore probe",
            emailVerifiedAt: new Date(),
          },
        });
      const invite = await pilot.issuePilotInvitation(
        actor.id,
        campaign.id,
        owner.email,
      );
      await assert.rejects(
        () => pilot.reservePilot(owner.id, invite.token),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 409,
      );
      const oldEnabled = process.env.OUTBOUND_EMAIL_ENABLED,
        oldDrill = process.env.RESTORE_DRILL;
      process.env.OUTBOUND_EMAIL_ENABLED = "true";
      process.env.RESTORE_DRILL = "false";
      let deliveries = 0;
      const result = await flushEmailOutbox({
        send: async () => {
          deliveries++;
        },
      });
      assert.equal(result.state, "disabled");
      assert.equal(deliveries, 0);
      process.env.OUTBOUND_EMAIL_ENABLED = oldEnabled;
      process.env.RESTORE_DRILL = oldDrill;
      pilotProbe = {
        active,
        readOnly,
        reserved: 1,
        sixthClaimRejected: true,
        outboundDeliveries: deliveries,
      };
    } finally {
      await db.$disconnect();
    }
  }
  // Create a private report with no row contents, credentials, or security links.
  const report = {
    passed: true,
    target,
    port,
    schemas: Object.keys(actual),
    tables: Object.values(actual).reduce(
      (n, s) => n + Object.keys(s).length,
      0,
    ),
    allChecksumsMatch: true,
    slipFiles:Object.keys(manifest.slips??{}).length,
    allSlipHashesMatch:true,
    outboundQuarantined: true,
    pilotProbe,
  };
  await writeFile(
    "output/pilot-d/restore.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await restored.$disconnect();
  if (started)
    execFileSync(ctl, ["stop", "-D", target, "-m", "fast", "-w"], {
      stdio: "pipe",
      windowsHide: true,
    });
}
