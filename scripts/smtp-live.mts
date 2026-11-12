// Explicit, single-message real SMTP test. Never drains the application's queue.
import "dotenv/config";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "../src/lib/db";
import { flushEmailOutbox } from "../src/lib/email-outbox";

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  smtpAuthenticated: false,
  smtpAccepted: false,
  inboxReceived: false,
};
const output = "docs/phases/evidence/smtp/live-check.json";
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const quoted = (s: string) => {
  if (/[\r\n]/.test(s)) throw new Error("Invalid IMAP argument");
  return `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};

async function receiveTest(messageId: string, host: string) {
  // Read-only mailbox access. Search only the exact Message-ID created below.
  const socket = tls.connect({
    host,
    port: 993,
    servername: host,
    rejectUnauthorized: true,
  });
  socket.setEncoding("utf8");
  socket.setTimeout(15000, () => socket.destroy(new Error("IMAP_TIMEOUT")));
  let pending:
    | { tag: string; resolve: (s: string) => void; reject: (e: Error) => void }
    | undefined;
  let buffer = "",
    sequence = 0;
  let greetingResolve: () => void, greetingReject: (e: Error) => void;
  const greeting = new Promise<void>((resolve, reject) => {
    greetingResolve = resolve;
    greetingReject = reject;
  });
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    if (!sequence && /^\* OK[^\r]*\r\n/i.test(buffer)) {
      buffer = "";
      greetingResolve();
    }
    if (
      pending &&
      new RegExp(
        `(?:^|\\r\\n)${pending.tag} (OK|NO|BAD)[^\\r]*\\r\\n`,
        "i",
      ).test(buffer)
    ) {
      const p = pending,
        text = buffer;
      pending = undefined;
      buffer = "";
      if (new RegExp(`(?:^|\\r\\n)${p.tag} OK`, "i").test(text))
        p.resolve(text);
      else p.reject(new Error("IMAP_COMMAND_REJECTED"));
    }
  });
  socket.on("error", () => {
    greetingReject(new Error("IMAP_CONNECTION_FAILED"));
    pending?.reject(new Error("IMAP_CONNECTION_FAILED"));
    pending = undefined;
  });
  socket.on("close", () => {
    pending?.reject(new Error("IMAP_CLOSED"));
    pending = undefined;
  });
  async function command(value: string) {
    const tag = `T${String(++sequence).padStart(4, "0")}`;
    const result = new Promise<string>((resolve, reject) => {
      pending = { tag, resolve, reject };
    });
    socket.write(`${tag} ${value}\r\n`);
    return result;
  }
  try {
    await greeting;
    await command(
      `LOGIN ${quoted(process.env.SMTP_USER!)} ${quoted(process.env.SMTP_PASS!)}`,
    );
    await command("EXAMINE INBOX");
    for (let attempt = 0; attempt < 5; attempt++) {
      const search = await command(
        `UID SEARCH HEADER Message-ID ${quoted(messageId)}`,
      );
      const ids =
        search.match(/\* SEARCH(?: (\d+(?: \d+)*))?\r\n/i)?.[1]?.split(" ") ??
        [];
      if (ids.length) {
        const headers = await command(
          `UID FETCH ${ids[0]} (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID AUTHENTICATION-RESULTS RECEIVED-SPF DKIM-SIGNATURE)])`,
        );
        return {
          folder: "INBOX",
          uid: Number(ids[0]),
          messageIdMatched: headers.includes(messageId),
          spf:
            headers
              .match(
                /\bspf=(pass|fail|softfail|neutral|none|temperror|permerror)/i,
              )?.[1]
              ?.toLowerCase() ?? "not_reported",
          dkim:
            headers
              .match(
                /\bdkim=(pass|fail|neutral|none|temperror|permerror)/i,
              )?.[1]
              ?.toLowerCase() ?? "not_reported",
          dmarc:
            headers
              .match(
                /\bdmarc=(pass|fail|bestguesspass|none|temperror|permerror)/i,
              )?.[1]
              ?.toLowerCase() ?? "not_reported",
          dkimSignaturePresent: /DKIM-Signature:/i.test(headers),
        };
      }
      if (attempt < 4)
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return { folder: "INBOX", messageIdMatched: false };
  } finally {
    socket.end();
    socket.destroy();
  }
}

try {
  const missing = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    report.missing = missing;
    throw new Error("SMTP_CONFIG_MISSING");
  }
  report.host = process.env.SMTP_HOST;
  report.port = Number(process.env.SMTP_PORT);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT === "465",
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
  });
  try {
    await transport.verify();
    report.smtpAuthenticated = true;
  } finally {
    transport.close();
  }
  if (process.argv.includes("--send")) {
    if (!process.argv.includes("--to"))
      throw new Error("TEST_RECIPIENT_REQUIRED");
    const to = z.string().email().parse(arg("--to"));
    if (
      process.argv.includes("--receive") &&
      to.toLowerCase() !== process.env.SMTP_USER!.toLowerCase()
    )
      throw new Error("READBACK_REQUIRES_SAME_MAILBOX");
    const id = randomUUID();
    const row = await db.emailOutbox.create({
      data: {
        to,
        subject: `BUZLIKE POS · ทดสอบ SMTP จริง [${id.slice(0, 8)}]`,
        text: `อีเมลทดสอบระบบ BUZLIKE POS\nเลขทดสอบ: ${id}\nส่งผ่าน outbox และ SMTP จริง เพื่อตรวจว่าระบบส่งอีเมลเข้ากล่องจดหมายได้\nไม่มีข้อมูลลูกค้า รหัสผ่าน หรือลิงก์ตั้งรหัสผ่านอยู่ในอีเมลนี้`,
        dedupeKey: `smtp-smoke:${id}`,
        availableAt: new Date(),
      },
    });
    report.outboxId = row.id;
    report.messageId = `<${row.id}@mail.buzlike.com>`;
    report.dispatch = process.argv.includes("--wait-worker")
      ? "background_worker"
      : "scoped_outbox";
    let saved = await db.emailOutbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    if (process.argv.includes("--wait-worker")) {
      const deadline = Date.now() + 40000;
      while (!saved.sentAt && !saved.failedAt && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        saved = await db.emailOutbox.findUniqueOrThrow({
          where: { id: row.id },
        });
      }
    } else {
      await flushEmailOutbox({ onlyId: row.id, limit: 1 });
      saved = await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    }
    report.smtpAccepted = !!saved.sentAt;
    report.attempts = saved.attempts;
    if (!report.smtpAccepted) throw new Error("SMTP_SEND_FAILED");
    if (process.argv.includes("--receive")) {
      if (!process.argv.includes("--imap-host"))
        throw new Error("IMAP_HOST_REQUIRED");
      const received = await receiveTest(
        String(report.messageId),
        arg("--imap-host"),
      );
      report.receipt = received;
      report.inboxReceived = received.messageIdMatched;
      if (!received.messageIdMatched) throw new Error("INBOX_NOT_CONFIRMED");
    }
  }
} catch (error) {
  const e = error as { code?: string; responseCode?: number; message?: string };
  report.errorCode =
    e.code ??
    (/^[A-Z_]+$/.test(e.message ?? "") ? e.message : "SMTP_CHECK_FAILED");
  report.responseCode = e.responseCode ?? null;
  process.exitCode = 1;
} finally {
  await mkdir("docs/phases/evidence/smtp", { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await db.$disconnect();
}
