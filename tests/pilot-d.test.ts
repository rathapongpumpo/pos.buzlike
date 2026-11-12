import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { productionConfigIssues } from "../src/lib/production-config";
import {
  backupKey,
  encryptBackup,
  decryptBackup,
} from "../scripts/lib/backup-crypto";
const schema = "qa_pilot_d_" + randomUUID().replaceAll("-", ""),
  root = new PrismaClient(),
  base = "http://localhost:3106",
  operationsToken = randomBytes(32).toString("hex");
let db: typeof import("../src/lib/db").db,
  ops: typeof import("../src/lib/operations"),
  mail: typeof import("../src/lib/email-outbox"),
  pilot: typeof import("../src/lib/pilot"),
  provision: typeof import("../src/lib/provision").provisionEmptyTenant,
  server: ChildProcess | undefined,
  adminId: string;
before(async () => {
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "6");
  process.env.DATABASE_URL = url.href;
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe", windowsHide: true },
  );
  ({ db } = await import("../src/lib/db"));
  ops = await import("../src/lib/operations");
  mail = await import("../src/lib/email-outbox");
  pilot = await import("../src/lib/pilot");
  ({ provisionEmptyTenant: provision } = await import("../src/lib/provision"));
  adminId = (
    await db.user.create({
      data: {
        email: `admin-${randomUUID()}@example.test`,
        fullName: "Admin",
        emailVerifiedAt: new Date(),
        systemRole: "SUPER_ADMIN",
      },
    })
  ).id;
  server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3106",
    ],
    {
      env: {
        ...process.env,
        AUTH_URL: base,
        NEXT_PUBLIC_APP_URL: base,
        OPERATIONS_TOKEN: operationsToken,
        OUTBOUND_EMAIL_ENABLED: "false",
        SMTP_HOST: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        STRIPE_SECRET_KEY: "",
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let diagnostic = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    diagnostic += chunk.toString();
    const lines = diagnostic.split("\n");
    diagnostic = lines.pop() ?? "";
    for (const line of lines)
      if (line.includes('"event":"request_failed"')) console.error(line);
  });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready);
});
test("D: empty pilot initialization is idempotent and keeps admission/payment closed", async () => {
  const { initializeEmptyPilot } =
    await import("../src/lib/pilot-initialization");
  const a = await initializeEmptyPilot(adminId),
    b = await initializeEmptyPilot(adminId);
  assert.deepEqual(a, b);
  assert.equal(a.status, "DRAFT");
  assert.equal(a.checkout, "DISABLED");
  assert.equal(await db.pilotInvitation.count(), 0);
  assert.equal(
    await db.pilotAuditEvent.count({
      where: { action: "PILOT_SERVER_PREPARED" },
    }),
    1,
  );
});
test("D: production preflight rejects placeholders, HTTP, demo seeding, delivery/commerce and incomplete contact", () => {
  const good: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    OPERATIONS_TOKEN: randomBytes(32).toString("hex"),
    AUTH_URL: "https://pos.example.test",
    NEXT_PUBLIC_APP_URL: "https://pos.example.test",
    DATABASE_URL: "postgresql://user:test-password@db:5432/buzlike",
    SEED_DEMO: "false",
    OUTBOUND_EMAIL_ENABLED: "true",
    SMTP_HOST: "smtp.example.test",
    SMTP_FROM: "support@example.test",
    SMTP_USER: "support@example.test",
    SMTP_PASS: "test-only",
    SMTP_PORT: "465",
    LEGAL_CONTACT_APPROVED: "true",
  };
  assert.deepEqual(productionConfigIssues(good), []);
  for (const patch of [
    { AUTH_URL: "http://localhost:3100" },
    { NEXT_PUBLIC_APP_URL: "https://other.example.test" },
    { SEED_DEMO: "true" },
    { AUTH_SECRET: "CHANGE_ME" },
    { OUTBOUND_EMAIL_ENABLED: "false" },
    { RESTORE_DRILL: "true" },
    { STRIPE_SECRET_KEY: "sk_test_placeholder" },
    { LEGAL_CONTACT_APPROVED: "false" },
    { AUTH_GOOGLE_ID: "incomplete" },
  ])
    assert(productionConfigIssues({ ...good, ...patch }).length);
});
test("D: public DB health exposes no internals; operations requires header token and reports missing workers", async () => {
  const response = await fetch(base + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert(response.headers.get("cache-control")?.includes("no-store"));
  for (const route of ["/api/ops", `/api/ops?token=${operationsToken}`])
    assert.equal((await fetch(base + route)).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/ops", {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
  const protectedResponse = await fetch(base + "/api/ops", {
    headers: { Authorization: `Bearer ${operationsToken}` },
  });
  assert.equal(protectedResponse.status, 503);
  const status = await protectedResponse.json();
  assert(status.alerts.includes("WORKER_EMAIL_STALE"));
  assert(!JSON.stringify(status).includes("@example.test"));
});
test("D: worker failures are durable, recovery clears alerts and stale/lag/dead letters alert again", async () => {
  await assert.rejects(() =>
    ops.workerRun("pilot", async () => {
      throw Error("provider details must not be stored");
    }),
  );
  assert.equal(
    (await db.workerHeartbeat.findUniqueOrThrow({ where: { name: "pilot" } }))
      .consecutiveFailures,
    1,
  );
  await ops.workerRun("pilot", async () => ({ done: true }));
  await ops.workerRun("email", async () => ({ done: true }));
  assert.equal((await ops.operationalStatus()).ok, true);
  assert.equal(
    (
      await fetch(base + "/api/ops", {
        headers: { Authorization: `Bearer ${operationsToken}` },
      })
    ).status,
    200,
  );
  const queued = await db.emailOutbox.create({
    data: {
      to: "private@example.test",
      subject: "secret subject",
      text: "Do not expose",
      availableAt: new Date(Date.now() - 400000),
    },
  });
  const state = await ops.operationalStatus();
  assert(state.alerts.includes("MAIL_QUEUE_LAG"));
  assert(!JSON.stringify(state).includes("secret subject"));
  await db.emailOutbox.update({
    where: { id: queued.id },
    data: { failedAt: new Date() },
  });
  assert((await ops.operationalStatus()).alerts.includes("MAIL_DEAD_LETTERS"));
  const stale = await ops.operationalStatus(db, Date.now() + 121000);
  assert(stale.alerts.includes("WORKER_PILOT_STALE"));
  await db.emailOutbox.delete({ where: { id: queued.id } });
});
test("D: restored DB quarantine and environment both block SMTP, even with a custom sender", async () => {
  const oldEnabled = process.env.OUTBOUND_EMAIL_ENABLED,
    oldDrill = process.env.RESTORE_DRILL;
  let deliveries = 0;
  const row = await db.emailOutbox.create({
    data: {
      to: "never-send@example.test",
      subject: "Quarantine",
      text: "Never deliver",
    },
  });
  try {
    process.env.OUTBOUND_EMAIL_ENABLED = "true";
    process.env.RESTORE_DRILL = "false";
    await db.operationalControl.update({
      where: { id: "platform" },
      data: { outboundQuarantinedAt: new Date() },
    });
    assert.equal(
      (
        await mail.flushEmailOutbox({
          onlyId: row.id,
          send: async () => {
            deliveries++;
          },
        })
      ).state,
      "disabled",
    );
    await db.operationalControl.update({
      where: { id: "platform" },
      data: { outboundQuarantinedAt: null },
    });
    process.env.OUTBOUND_EMAIL_ENABLED = "false";
    assert.equal(
      (
        await mail.flushEmailOutbox({
          onlyId: row.id,
          send: async () => {
            deliveries++;
          },
        })
      ).state,
      "disabled",
    );
    process.env.OUTBOUND_EMAIL_ENABLED = "true";
    process.env.RESTORE_DRILL = "true";
    assert.equal(
      (
        await mail.flushEmailOutbox({
          onlyId: row.id,
          send: async () => {
            deliveries++;
          },
        })
      ).state,
      "disabled",
    );
    assert.equal(deliveries, 0);
    assert.equal(
      (await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } }))
        .attempts,
      0,
    );
  } finally {
    if (oldEnabled === undefined) delete process.env.OUTBOUND_EMAIL_ENABLED;
    else process.env.OUTBOUND_EMAIL_ENABLED = oldEnabled;
    if (oldDrill === undefined) delete process.env.RESTORE_DRILL;
    else process.env.RESTORE_DRILL = oldDrill;
    await db.emailOutbox.delete({ where: { id: row.id } });
  }
});
test("D: unexpected server errors log only a correlation ID/category, never payload or URL tokens", () => {
  const original = console.error,
    lines: string[] = [];
  console.error = (value: unknown) => {
    lines.push(String(value));
  };
  try {
    const id = ops.safeServerError(
      Error(
        "postgresql://user:private-password@host/db token=PRIVATE_URL_TOKEN support@example.test",
      ),
    );
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.equal(lines.length, 1);
    assert(!/private-password|PRIVATE_URL_TOKEN|support@/.test(lines[0]));
    assert.equal(JSON.parse(lines[0]).requestId, id);
  } finally {
    console.error = original;
  }
});
test("D: backup encryption round-trip authenticates contents and rejects tampering, wrong key and overwrite", async () => {
  const directory = path.resolve("output/pilot-d/crypto-test-" + randomUUID());
  await mkdir(directory, { recursive: true });
  const key = randomBytes(32),
    file = path.join(directory, "backup.enc"),
    plain = path.join(directory, "restore.dump"),
    text = "PGDMP-PRIVATE-RESTORE-TEST";
  assert.deepEqual(backupKey(key.toString("base64")), key);
  assert.throws(() => backupKey("bad"));
  await encryptBackup(Readable.from([Buffer.from(text)]), file, key);
  assert(!(await readFile(file)).includes(Buffer.from(text)));
  await decryptBackup(file, plain, key);
  assert.equal(await readFile(plain, "utf8"), text);
  await assert.rejects(() => decryptBackup(file, plain, key));
  assert.equal(await readFile(plain, "utf8"), text);
  await assert.rejects(() =>
    decryptBackup(file, path.join(directory, "wrong.dump"), randomBytes(32)),
  );
  const changed = await readFile(file);
  changed[25] ^= 1;
  await writeFile(path.join(directory, "tampered.enc"), changed);
  await assert.rejects(() =>
    decryptBackup(
      path.join(directory, "tampered.enc"),
      path.join(directory, "tampered.dump"),
      key,
    ),
  );
  for (const name of ["backup.enc", "restore.dump", "tampered.enc"])
    await unlink(path.join(directory, name));
});
test("D: public support/privacy/terms are reachable anonymously and do not require account creation", async () => {
  for (const route of ["/support", "/privacy", "/terms"]) {
    const response = await fetch(base + route, { redirect: "manual" });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes("support@buzlike.com"));
  }
});
test("D workload: 5 shops x 2 branches x 2 terminals, concurrent retry preserves 40 sales/payments/stock", async () => {
  const draft = await pilot.createPilotCampaign(adminId, "workload"),
    campaign = await pilot.setCampaignStatus(
      adminId,
      draft.id,
      "OPEN",
      draft.version,
    );
  const requests: {
      slug: string;
      cookie: string;
      input: Record<string, unknown>;
    }[] = [],
    branchIds: string[] = [],
    tenantIds: string[] = [];
  for (let n = 0; n < 5; n++) {
    const user = await db.user.create({
        data: {
          email: `load-${n}@example.test`,
          fullName: "Load owner",
          emailVerifiedAt: new Date(),
        },
      }),
      invite = await pilot.issuePilotInvitation(
        adminId,
        campaign.id,
        user.email,
      ),
      grant = await pilot.reservePilot(user.id, invite.token),
      tenant = await db.tenant.create({
        data: {
          ownerId: user.id,
          name: "Load shop",
          slug: `load-${n}`,
          trialEndsAt: new Date(Date.now() + 86400000),
        },
      });
    const first = await db.$transaction((tx) =>
        provision(tx, tenant.id, "846295", user.id, "Owner", "", "NONE"),
      ),
      second = await db.storeBranch.create({
        data: { tenantId: tenant.id, name: "Branch 2", vatRate: 0 },
      });
    await db.$transaction((tx) =>
      pilot.activatePilot(tx, user.id, grant.id, tenant.id),
    );
    tenantIds.push(tenant.id);
    const staff = await db.staffMember.findFirstOrThrow({
        where: { tenantId: tenant.id, userId: user.id },
      }),
      category = await db.category.create({
        data: { tenantId: tenant.id, name: "Load" },
      }),
      product = await db.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: category.id,
          sku: "LOAD",
          name: "Load product",
          price: 50,
          costPrice: 20,
          trackStockType: "DIRECT_UNIT",
          directStockQty: 0,
        },
      });
    const cookie = `authjs.session-token=${await encode({ token: { sub: user.id, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
    for (const branch of [first, second]) {
      branchIds.push(branch.id);
      await db.branchProduct.upsert({
        where: {
          branchId_productId: { branchId: branch.id, productId: product.id },
        },
        create: {
          tenantId: tenant.id,
          branchId: branch.id,
          productId: product.id,
          price: 50,
          quantity: 100,
        },
        update: { price: 50, quantity: 100 },
      });
      const shift = await db.cashierShift.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          staffId: staff.id,
          startingCash: 0,
          expectedCash: 0,
        },
      });
      for (let terminal = 0; terminal < 2; terminal++) {
        const terminalId = randomUUID();
        for (let sale = 0; sale < 2; sale++)
          requests.push({
            slug: tenant.slug,
            cookie,
            input: {
              clientOrderId: randomUUID(),
              terminalId,
              branchId: branch.id,
              operatorId: staff.id,
              shiftId: shift.id,
              items: [{ productId: product.id, quantity: 1 }],
              method: "CASH",
              cashReceived: 100,
              expectedGrandTotal: 50,
            },
          });
      }
    }
  }
  const results = await Promise.all(
    requests
      .flatMap((r) => [r, r])
      .map(async (r) => {
        const start = Date.now();
        const response = await fetch(
          `${base}/api/v1/${r.slug}/orders?branchId=${r.input.branchId}`,
          {
            method: "POST",
            headers: {
              Cookie: r.cookie,
              Origin: base,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(r.input),
          },
        );
        assert.equal(response.status, 200, await response.clone().text());
        return { ms: Date.now() - start, id: (await response.json()).id };
      }),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 40);
  assert.equal(
    await db.order.count({
      where: { tenantId: { in: tenantIds }, status: "PAID" },
    }),
    40,
  );
  const sums = await db.order.aggregate({
    where: { tenantId: { in: tenantIds } },
    _sum: { grandTotal: true },
  });
  assert.equal(Number(sums._sum.grandTotal), 2000);
  const stocks = await db.branchProduct.findMany({
    where: { branchId: { in: branchIds } },
  });
  assert(stocks.every((s) => s.quantity === 96));
  assert.equal(
    await db.productStockMovement.count({
      where: { tenantId: { in: tenantIds }, kind: "SALE" },
    }),
    40,
  );
  const times = results.map((r) => r.ms).sort((a, b) => a - b),
    report = {
      passed: true,
      shops: 5,
      branches: 10,
      terminals: 20,
      concurrentRequests: 80,
      uniqueSales: 40,
      total: 2000,
      stockPerBranch: 96,
      p95Ms: times[Math.floor(times.length * 0.95)],
      maxMs: times.at(-1),
    };
  assert(report.maxMs! < 15000, "Local smoke burst exceeded 15 second ceiling");
  await mkdir("output/pilot-d", { recursive: true });
  await writeFile(
    "output/pilot-d/workload.json",
    JSON.stringify(report, null, 2),
  );
});
test("D onboarding burst: 5 reservations with 20 simultaneous retries each create exactly five empty shops", async () => {
  const draft = await pilot.createPilotCampaign(adminId, "onboarding-burst"),
    campaign = await pilot.setCampaignStatus(
      adminId,
      draft.id,
      "OPEN",
      draft.version,
    );
  const inputs: {
    cookie: string;
    body: Record<string, unknown>;
    ownerId: string;
    grantId: string;
  }[] = [];
  for (let n = 0; n < 5; n++) {
    const user = await db.user.create({
        data: {
          email: `burst-${n}@example.test`,
          fullName: "Burst owner",
          emailVerifiedAt: new Date(),
        },
      }),
      invite = await pilot.issuePilotInvitation(
        adminId,
        campaign.id,
        user.email,
      ),
      grant = await pilot.reservePilot(user.id, invite.token);
    inputs.push({
      ownerId: user.id,
      grantId: grant.id,
      cookie: `authjs.session-token=${await encode({ token: { sub: user.id, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`,
      body: {
        pilotEnrollmentId: grant.id,
        requestKey: randomUUID(),
        name: `Burst shop ${n}`,
        businessType: "RETAIL_SHOP",
        pin: "846295",
        confirmPin: "846295",
      },
    });
  }
  const results = await Promise.all(
    inputs
      .flatMap((input) => Array.from({ length: 20 }, () => input))
      .map(async (input) => {
        const response = await fetch(base + "/api/onboarding", {
          method: "POST",
          headers: {
            Cookie: input.cookie,
            Origin: base,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.body),
        });
        return { status: response.status, body: await response.json() };
      }),
  );
  const failed = results.filter((r) => r.status !== 201);
  assert.equal(failed.length, 0, JSON.stringify(failed));
  assert.equal(new Set(results.map((r) => r.body.slug)).size, 5);
  for (const input of inputs) {
    assert.equal(
      await db.tenant.count({ where: { ownerId: input.ownerId } }),
      1,
    );
    const grant = await db.pilotEnrollment.findUniqueOrThrow({
      where: { id: input.grantId },
    });
    assert.equal(grant.status, "ACTIVE");
    assert.equal(+grant.endsAt! - +grant.activatedAt!, 30 * 86400000);
    assert.equal(
      await db.product.count({ where: { tenantId: grant.tenantId! } }),
      0,
    );
  }
  const { initializeEmptyPilot } =
    await import("../src/lib/pilot-initialization");
  await assert.rejects(() => initializeEmptyPilot(adminId));
  await writeFile(
    "output/pilot-d/onboarding-burst.json",
    JSON.stringify(
      {
        passed: true,
        owners: 5,
        concurrentRequests: 100,
        shops: 5,
        daysPerGrant: 30,
      },
      null,
      2,
    ),
  );
});
after(async () => {
  if (server && server.exitCode === null)
    await new Promise<void>((resolve) => {
      server!.once("exit", () => resolve());
      server!.kill();
      setTimeout(resolve, 3000);
    });
  if (db) await db.$disconnect();
  await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.$disconnect();
});
