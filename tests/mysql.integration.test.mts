import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, serial, retryableTransaction } from "../src/lib/db";
import { databaseClock, transactionLock } from "../src/lib/database-dialect";
import * as pilot from "../src/lib/pilot";
import { PILOT_PRO_V1, effectiveTenantById } from "../src/lib/entitlements";
import { provisionEmptyTenant } from "../src/lib/provision";
import { encryptMail, flushEmailOutbox } from "../src/lib/email-outbox";
import { Prisma } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL!);
if (
  url.protocol !== "mysql:" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.includes("_qa")
)
  throw Error(
    "MySQL integration tests require an isolated local *_qa database",
  );
const run = randomUUID();
const email = (suffix: string) => `mysql-${suffix}-${run}@example.test`;
let campaignId = "",
  adminId = "";
const grants: { ownerId: string; id: string }[] = [];

test("MySQL: UTC clock, tables and financial/branch constraints are enforced by MariaDB", async () => {
  assert.ok(Math.abs(+(await databaseClock(db)) - Date.now()) < 3000);
  const [meta] = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()`;
  assert.ok(Number(meta.n) >= 9);
  assert.equal(
    retryableTransaction(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2010",
        clientVersion: "6.19.3",
        meta: { code: "1020" },
      }),
    ),
    true,
  );
  assert.equal(retryableTransaction(new Error("business error")), false);
  const invalid = { ...PILOT_PRO_V1, maxBranches: 900 };
  await assert.rejects(
    db.pilotCampaign.create({
      data: { slug: `bad-${run}`, entitlementsSnapshot: invalid },
    }),
  );
});

test("MySQL: 30 competing transactions lock one row and preserve every increment", async () => {
  const key = `mysql-lock-${run}`;
  await db.rateLimit.create({
    data: { key, count: 0, resetAt: new Date(Date.now() + 3600000) },
  });
  await Promise.all(
    Array.from({ length: 30 }, () =>
      serial(async (tx) => {
        await transactionLock(tx, key);
        const row = await tx.rateLimit.findUniqueOrThrow({ where: { key } });
        await tx.rateLimit.update({
          where: { key },
          data: { count: row.count + 1 },
        });
      }),
    ),
  );
  assert.equal(
    (await db.rateLimit.findUniqueOrThrow({ where: { key } })).count,
    30,
  );
});

test("MySQL: database defaults and mail eligibility stay UTC in a Bangkok session", async () => {
  await db.$transaction(async (tx) => {
    const [old] = await tx.$queryRaw<
      { zone: string }[]
    >`SELECT @@session.time_zone AS zone`;
    await tx.$executeRaw`SET time_zone='+07:00'`;
    try {
      const now = await databaseClock(tx);
      const row = await tx.emailOutbox.create({
        data: { to: email("utc"), subject: "UTC", text: "test" },
      });
      assert.ok(Math.abs(+row.createdAt - +now) < 3000);
      assert.ok(Math.abs(+row.availableAt - +now) < 3000);
      await tx.emailOutbox.delete({ where: { id: row.id } });
    } finally {
      await tx.$executeRaw`SET time_zone=${old.zone}`;
    }
  });
});

test("MySQL: concurrent invitations reserve exactly five places and freeze issued terms", async () => {
  const admin = await db.user.create({
    data: {
      email: email("admin"),
      fullName: "MySQL admin",
      systemRole: "SUPER_ADMIN",
    },
  });
  adminId = admin.id;
  let c = await pilot.createPilotCampaign(admin.id, `mysql-${run}`);
  c = await pilot.setCampaignStatus(admin.id, c.id, "OPEN", c.version);
  campaignId = c.id;
  const candidates = [];
  for (let n = 0; n < 9; n++) {
    const owner = await db.user.create({
      data: {
        email: email(String(n)),
        fullName: "ร้านทดสอบ 🛒",
        emailVerifiedAt: new Date(),
      },
    });
    const issued = await pilot.issuePilotInvitation(
      admin.id,
      c.id,
      owner.email,
    );
    candidates.push({ owner, token: issued.token });
  }
  const results = await Promise.allSettled(
    candidates.map(async (x) => {
      const grant = await pilot.reservePilot(x.owner.id, x.token);
      return { ownerId: x.owner.id, id: grant.id };
    }),
  );
  grants.push(
    ...results
      .filter(
        (r): r is PromiseFulfilledResult<{ ownerId: string; id: string }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value),
  );
  assert.equal(
    grants.length,
    5,
    JSON.stringify(
      results.map((r) =>
        r.status === "rejected"
          ? {
              name: r.reason.name,
              code: r.reason.code,
              message: String(r.reason.message).slice(-300),
            }
          : { ok: true },
      ),
    ),
  );
  assert.equal(
    await db.pilotEnrollment.count({ where: { campaignId: c.id } }),
    5,
  );
  await assert.rejects(
    db.pilotCampaign.update({ where: { id: c.id }, data: { capacity: 4 } }),
  );
});

test("MySQL: activation creates an empty tenant, lasts 30 days and cannot extend or reassign itself", async () => {
  const picked = grants[0];
  assert.ok(picked);
  const result = await serial(async (tx) => {
    await pilot.lockPilotCampaign(tx, campaignId);
    const tenant = await tx.tenant.create({
      data: {
        ownerId: picked.ownerId,
        name: "ร้านใหม่ ทดสอบภาษาไทย 🧋",
        slug: `mysql-shop-${run}`,
        trialEndsAt: new Date(Date.now() - 1000),
      },
    });
    await provisionEmptyTenant(
      tx,
      tenant.id,
      "619472",
      picked.ownerId,
      "เจ้าของร้าน",
      "",
      "NONE",
    );
    return pilot.activatePilot(tx, picked.ownerId, picked.id, tenant.id);
  });
  assert.equal(+result.endsAt! - +result.activatedAt!, 30 * 86400000);
  assert.equal(
    await db.product.count({ where: { tenantId: result.tenantId! } }),
    0,
  );
  const duplicate = await serial((tx) =>
    pilot.activatePilot(tx, picked.ownerId, picked.id, result.tenantId!),
  );
  assert.equal(+duplicate.endsAt!, +result.endsAt!);
  const rights = await effectiveTenantById(result.tenantId!);
  assert.equal(rights.entitlement.source, "PILOT");
  assert.equal(rights.tenant.maxBranches, 3);
  assert.equal(
    await db.saasPayment.count({ where: { tenantId: result.tenantId! } }),
    0,
  );
  await assert.rejects(
    db.pilotEnrollment.update({
      where: { id: picked.id },
      data: { activatedAt: new Date(), version: { increment: 1 } },
    }),
  );
  await assert.rejects(db.pilotEnrollment.delete({ where: { id: picked.id } }));
  await assert.rejects(
    db.pilotEnrollment.update({
      where: { id: picked.id },
      data: { endsAt: new Date(Date.now() + 4000000000) },
    }),
  );
});

test("MySQL: SKIP LOCKED claims encrypted long Thai mail exactly once across concurrent workers", async () => {
  const old = process.env.OUTBOUND_EMAIL_ENABLED;
  process.env.OUTBOUND_EMAIL_ENABLED = "true";
  const text = "ข้อความทดสอบ ภาษาไทย 🧋 ".repeat(200);
  const rows = [];
  for (let n = 0; n < 5; n++)
    rows.push(
      await db.emailOutbox.create({
        data: {
          to: email("mail"),
          subject: "ทดสอบคิว",
          text: "",
          encryptedText: encryptMail(text),
          availableAt: new Date(Date.now() - 1000),
        },
      }),
    );
  const received: string[] = [];
  const send = async (mail: { messageId: string; text: string }) => {
    assert.equal(mail.text, text);
    received.push(mail.messageId);
    await new Promise((r) => setTimeout(r, 10));
  };
  try {
    for (const row of rows)
      await Promise.all(
        Array.from({ length: 4 }, () =>
          flushEmailOutbox({ onlyId: row.id, send, limit: 1 }),
        ),
      );
    assert.equal(received.length, 5);
    assert.equal(new Set(received).size, 5);
    assert.equal(
      await db.emailOutbox.count({
        where: { id: { in: rows.map((x) => x.id) }, sentAt: { not: null } },
      }),
      5,
    );
    const failed = await db.emailOutbox.create({
      data: {
        to: email("fail"),
        subject: "retry",
        text: "test",
        availableAt: new Date(Date.now() - 1000),
      },
    });
    await flushEmailOutbox({
      onlyId: failed.id,
      send: async () => {
        throw Error("simulated SMTP failure");
      },
      limit: 1,
    });
    const retry = await db.emailOutbox.findUniqueOrThrow({
      where: { id: failed.id },
    });
    assert.equal(retry.sentAt, null);
    assert.equal(retry.attempts, 1);
    assert.ok(retry.availableAt > new Date());
    const expired = await db.emailOutbox.create({
      data: {
        to: email("expired"),
        subject: "expired",
        text: "test",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await flushEmailOutbox({ onlyId: expired.id, send, limit: 1 });
    assert.ok(
      (await db.emailOutbox.findUniqueOrThrow({ where: { id: expired.id } }))
        .failedAt,
    );
    await db.operationalControl.update({
      where: { id: "platform" },
      data: { outboundQuarantinedAt: new Date() },
    });
    const quarantined = await flushEmailOutbox({ send, limit: 1 });
    assert.equal(quarantined.state, "disabled");
  } finally {
    process.env.OUTBOUND_EMAIL_ENABLED = old;
    await db.operationalControl.update({
      where: { id: "platform" },
      data: { outboundQuarantinedAt: null },
    });
  }
});

after(async () => db.$disconnect());
