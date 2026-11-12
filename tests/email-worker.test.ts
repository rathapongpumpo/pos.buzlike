import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { db } from "../src/lib/db";
import { encryptMail, flushEmailOutbox } from "../src/lib/email-outbox";
test("Phase 2 mail worker: real local SMTP, parallel claim, retry/backoff, dead letters, expired links and abandoned leases", async () => {
  const schema = "qa_mail_" + randomUUID().replaceAll("-", "");
  assert.match(schema, /^qa_mail_[a-f0-9]+$/);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: url.href });
  const received: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 local.test ESMTP\r\n");
    let buffer = "",
      data = false,
      message = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (data) {
          if (line === ".") {
            received.push(message);
            message = "";
            data = false;
            socket.write("250 queued\r\n");
          } else message += line + "\r\n";
        } else if (/^EHLO|^HELO/.test(line))
          socket.write("250-local.test\r\n250 PIPELINING\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") {
          socket.end("221 bye\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
  });
  const env = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    from: process.env.SMTP_FROM,
    user: process.env.SMTP_USER,
  };
  try {
    execFileSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      { env: { ...process.env, DATABASE_URL: url.href }, stdio: "pipe" },
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(port);
    process.env.SMTP_FROM = "QA <qa@example.test>";
    delete process.env.SMTP_USER;
    const input = {
      to: "sink@example.test",
      subject: "Local QA",
      text: "[protected]",
      encryptedText: encryptMail("Local secret-link body"),
    };
    const row = await client.emailOutbox.create({ data: input });
    const results = await Promise.all([
      flushEmailOutbox({ client }),
      flushEmailOutbox({ client }),
    ]);
    assert.equal(
      results.reduce((n, r) => n + r.sent, 0),
      1,
    );
    assert.equal(received.length, 1);
    assert.ok(received[0].includes("Local secret-link body"));
    const sent = await client.emailOutbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.ok(sent.sentAt);
    assert.equal(sent.encryptedText, null);
    const retry = await client.emailOutbox.create({ data: input });
    const failed = await flushEmailOutbox({
      client,
      send: async () => {
        throw new Error("Private transport details");
      },
    });
    assert.equal(failed.failed, 1);
    let queued = await client.emailOutbox.findUniqueOrThrow({
      where: { id: retry.id },
    });
    assert.equal(queued.attempts, 1);
    assert.ok(queued.availableAt > new Date());
    assert.equal(queued.sentAt, null);
    assert.equal(queued.lastError, "SMTP delivery failed");
    assert.equal((await flushEmailOutbox({ client })).sent, 0);
    await client.emailOutbox.update({
      where: { id: retry.id },
      data: { availableAt: new Date(0) },
    });
    assert.equal((await flushEmailOutbox({ client })).sent, 1);
    const dead = await client.emailOutbox.create({
      data: { ...input, attempts: 7 },
    });
    await flushEmailOutbox({
      client,
      send: async () => {
        throw new Error("failure");
      },
    });
    assert.ok(
      (await client.emailOutbox.findUniqueOrThrow({ where: { id: dead.id } }))
        .failedAt,
    );
    const expired = await client.emailOutbox.create({
      data: { ...input, expiresAt: new Date(0) },
    });
    const abandoned = await client.emailOutbox.create({
      data: {
        ...input,
        lockedAt: new Date(Date.now() - 360000),
        lockedBy: "crashed-worker",
      },
    });
    assert.equal((await flushEmailOutbox({ client })).sent, 1);
    assert.ok(
      (
        await client.emailOutbox.findUniqueOrThrow({
          where: { id: abandoned.id },
        })
      ).sentAt,
    );
    assert.equal(
      (
        await client.emailOutbox.findUniqueOrThrow({
          where: { id: expired.id },
        })
      ).encryptedText,
      null,
    );
    assert.equal(received.length, 3);
    const untouched = await client.emailOutbox.create({
      data: { ...input, availableAt: new Date(0) },
    });
    const selected = await client.emailOutbox.create({ data: input });
    assert.equal(
      (await flushEmailOutbox({ client, onlyId: selected.id, limit: 1 })).sent,
      1,
    );
    assert.equal(
      (
        await client.emailOutbox.findUniqueOrThrow({
          where: { id: untouched.id },
        })
      ).sentAt,
      null,
    );
    assert.equal(
      (
        await client.emailOutbox.findUniqueOrThrow({
          where: { id: untouched.id },
        })
      ).attempts,
      0,
    );
    assert.equal(received.length, 4);
  } finally {
    for (const [key, value] of Object.entries({
      SMTP_HOST: env.host,
      SMTP_PORT: env.port,
      SMTP_FROM: env.from,
      SMTP_USER: env.user,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((r) => server.close(() => r()));
    await client.$disconnect();
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
});
after(async () => {
  await db.$disconnect();
});
