import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import {mkdir,writeFile,unlink} from "node:fs/promises";
const schema = "qa_pilot_d_restore_" + randomUUID().replaceAll("-", ""),
  source = process.env.DATABASE_URL!,
  root = new PrismaClient();
const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
let fixture: PrismaClient | undefined;
const slipProbe=path.resolve(`data/slips/restore-probe-${randomUUID()}.txt`);
try {
  await mkdir(path.resolve("data/slips"),{recursive:true});await writeFile(slipProbe,"BUZLIKE restore probe; no customer data",{flag:"wx"});
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(source);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.href;
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe", windowsHide: true },
  );
  const { db } = await import("../src/lib/db"),
    pilot = await import("../src/lib/pilot"),
    { provisionEmptyTenant } = await import("../src/lib/provision"),
    { encryptMail } = await import("../src/lib/email-outbox");
  fixture = db;
  const admin = await db.user.create({
      data: {
        email: `admin-${randomUUID()}@example.test`,
        fullName: "Restore admin",
        systemRole: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
      },
    }),
    draft = await pilot.createPilotCampaign(admin.id, "restore-drill"),
    campaign = await pilot.setCampaignStatus(
      admin.id,
      draft.id,
      "OPEN",
      draft.version,
    );
  for (let n = 0; n < 5; n++) {
    const user = await db.user.create({
        data: {
          email: `restore-${n}@example.test`,
          fullName: "Restore owner",
          emailVerifiedAt: new Date(),
        },
      }),
      invite = await pilot.issuePilotInvitation(
        admin.id,
        campaign.id,
        user.email,
      ),
      grant = await pilot.reservePilot(user.id, invite.token);
    if (n < 4) {
      const tenant = await db.tenant.create({
        data: {
          ownerId: user.id,
          name: `Restore fixture ${n}`,
          slug: `restore-${n}`,
          trialEndsAt: new Date(Date.now() + 86400000),
        },
      });
      await db.$transaction((tx) =>
        provisionEmptyTenant(
          tx,
          tenant.id,
          "846295",
          user.id,
          "Owner",
          "",
          "NONE",
        ),
      );
      const activatedAt = new Date(Date.now() - (n === 3 ? 31 : 0) * 86400000),
        endsAt = new Date(+activatedAt + 30 * 86400000);
      await db.pilotEnrollment.update({
        where: { id: grant.id },
        data: {
          tenantId: tenant.id,
          activatedAt,
          endsAt,
          status: n === 3 ? "EXPIRED" : "ACTIVE",
          version: { increment: 1 },
        },
      });
    }
  }
  await db.emailOutbox.create({
    data: {
      to: "never-send@example.test",
      subject: "Restore quarantine probe",
      text: "[protected account link]",
      encryptedText: encryptMail("FAKE RESTORE DRILL LINK"),
      dedupeKey: `restore-${randomUUID()}`,
    },
  });
  await db.$disconnect();
  await root.$disconnect();
  const output = execFileSync(
    process.execPath,
    [cli, "scripts/phase1-backup.mts", "pilot-d"],
    {
      env: { ...process.env, DATABASE_URL: source },
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
    },
  );
  const backup = JSON.parse(
    output.split(/\r?\n/).find((line) => line.startsWith('{"backup"'))!,
  ).backup;
  const restored = execFileSync(
    process.execPath,
    [
      cli,
      "scripts/ops-restore-drill.mts",
      "--backup",
      backup,
      "--verify-pilot",
      schema,
    ],
    {
      env: { ...process.env, DATABASE_URL: source },
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
    },
  );
  console.log(restored.trim());
} finally {
  await unlink(slipProbe).catch(()=>{});
  if (fixture) await fixture.$disconnect();
  await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.$disconnect();
}
