import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import nodemailer from "nodemailer";
import type { EmailOutbox, Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { databaseTime, lockPilotCampaign } from "./pilot";
import { effectiveTenant } from "./entitlements";
import { outboundAllowed } from "./operations";
import { mysqlDatabase, databaseClock } from "./database-dialect";

const encryptionKey = () => {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required");
  return createHash("sha256")
    .update(`email-outbox:${process.env.AUTH_SECRET}`)
    .digest();
};
export function encryptMail(text: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptMail(text: string) {
  const [iv, tag, body] = text
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
export async function queueAccountMail(
  tx: Prisma.TransactionClient,
  input: {
    to: string;
    subject: string;
    text: string;
    dedupeKey: string;
    expiresAt: Date;
    tenantId?: string;
    userId?: string;
  },
) {
  return tx.emailOutbox.create({
    data: {
      ...input,
      text: "[protected account link]",
      encryptedText: encryptMail(input.text),
    },
  });
}
export function appLink(path: string) {
  const url = new URL(
    process.env.AUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3100",
  );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Account links require HTTPS");
  return new URL(path, url.origin).href;
}
export type MailSender = (mail: {
  to: string;
  subject: string;
  text: string;
  messageId: string;
}) => Promise<unknown>;
async function deliverPilotMail(
  client: PrismaClient,
  row: EmailOutbox,
  lease: string,
  send: MailSender,
) {
  // This transaction is NOT retried. Serialize SMTP hand-off with extension/revocation
  // using the campaign lock, so an old deadline cannot pass validation then send
  // after a committed extension. A provider-accepted but disconnected SMTP call
  // remains ambiguous; the stable Message-ID mitigates, not guarantees, deduplication.
  return client.$transaction(
    async (tx) => {
      const inviteId = row.dedupeKey?.startsWith("pilot-invite:")
        ? row.dedupeKey.split(":")[1]
        : null;
      const preview = inviteId
        ? await tx.pilotInvitation.findUnique({ where: { id: inviteId } })
        : row.pilotEnrollmentId
          ? await tx.pilotEnrollment.findUnique({
              where: { id: row.pilotEnrollmentId },
            })
          : null;
      if (preview) await lockPilotCampaign(tx, preview.campaignId);
      const fresh = await tx.emailOutbox.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (fresh.lockedBy !== lease || fresh.sentAt || fresh.failedAt)
        return false;
      const now = await databaseTime(tx);
      let valid = !!preview && (!fresh.expiresAt || fresh.expiresAt > now);
      if (inviteId) {
        const invitation = await tx.pilotInvitation.findUnique({
          where: { id: inviteId },
        });
        valid =
          valid &&
          !!invitation &&
          !invitation.revokedAt &&
          invitation.expiresAt > now &&
          invitation.tokenVersion === Number(row.dedupeKey!.split(":")[2]);
      } else if (row.pilotEnrollmentId) {
        const grant = await tx.pilotEnrollment.findUnique({
          where: { id: row.pilotEnrollmentId },
          include: { tenant: true },
        });
        valid =
          valid &&
          !!grant?.tenant &&
          grant.version === row.pilotEnrollmentVersion &&
          +grant.endsAt! === +row.pilotTargetEndsAt! &&
          ["ACTIVE", "EXPIRED"].includes(grant.status);
        if (valid && grant?.tenant)
          valid =
            (await effectiveTenant(grant.tenant, tx, +now)).entitlement
              .source === "PILOT" &&
            (row.notificationKind === "EXPIRED"
              ? grant.endsAt! <= now
              : grant.endsAt! > now);
      }
      if (!valid) {
        await tx.emailOutbox.update({
          where: { id: row.id },
          data: {
            failedAt: now,
            lastError: "Pilot notice superseded",
            encryptedText: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        return false;
      }
      await send({
        to: fresh.to,
        subject: fresh.subject,
        text: fresh.encryptedText
          ? decryptMail(fresh.encryptedText)
          : fresh.text,
        messageId: `<${fresh.id}@mail.buzlike.com>`,
      });
      await tx.emailOutbox.update({
        where: { id: row.id },
        data: {
          sentAt: new Date(),
          encryptedText: null,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      return true;
    },
    { timeout: 45000, maxWait: 5000 },
  );
}
export async function flushEmailOutbox(
  options: {
    send?: MailSender;
    limit?: number;
    client?: PrismaClient;
    onlyId?: string;
  } = {},
) {
  const client = options.client ?? db;
  if (!(await outboundAllowed(client)))
    return { state: "disabled", sent: 0, failed: 0 };
  if (!options.send && (!process.env.SMTP_HOST || !process.env.SMTP_FROM))
    return { state: "not_configured", sent: 0, failed: 0 };
  const transport = options.send
    ? null
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_PORT === "465",
        requireTLS: !["localhost", "127.0.0.1"].includes(
          process.env.SMTP_HOST!,
        ),
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
  const send: MailSender =
    options.send ??
    ((mail) => transport!.sendMail({ ...mail, from: process.env.SMTP_FROM }));
  let sent = 0,
    failed = 0;
  try {
    // Never deliver expired security links; keep metadata without the secret body.
    await client.emailOutbox.updateMany({
      where: {
        id: options.onlyId,
        sentAt: null,
        failedAt: null,
        expiresAt: { lte: new Date() },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(Date.now() - 300000) } },
        ],
      },
      data: {
        failedAt: new Date(),
        lastError: "Link expired",
        encryptedText: null,
      },
    });
    for (let n = 0; n < (options.limit ?? 20); n++) {
      const lease = randomUUID();
      // Prisma stores DateTime as UTC timestamp without timezone. Never compare
      // those columns against a session-local clock (the DB may run in Bangkok).
      const rows = mysqlDatabase()
        ? await client.$transaction(
            async (tx) => {
              const ids = await tx.$queryRaw<
                { id: string }[]
              >`SELECT id FROM EmailOutbox WHERE (${options.onlyId ?? null} IS NULL OR id=${options.onlyId ?? null}) AND sentAt IS NULL AND failedAt IS NULL AND availableAt <= UTC_TIMESTAMP(3) AND (expiresAt IS NULL OR expiresAt>UTC_TIMESTAMP(3)) AND (lockedAt IS NULL OR lockedAt<UTC_TIMESTAMP(3)-INTERVAL 5 MINUTE) ORDER BY availableAt, createdAt LIMIT 1 FOR UPDATE SKIP LOCKED`;
              if (!ids[0]) return [];
              return [
                await tx.emailOutbox.update({
                  where: { id: ids[0].id },
                  data: {
                    lockedAt: await databaseClock(tx),
                    lockedBy: lease,
                    attempts: { increment: 1 },
                  },
                }),
              ];
            },
            { isolationLevel: "ReadCommitted" },
          )
        : await client.$queryRaw<
            EmailOutbox[]
          >`UPDATE "EmailOutbox" SET "lockedAt"=(now() AT TIME ZONE 'UTC'), "lockedBy"=${lease}, attempts=attempts+1 WHERE id=(SELECT id FROM "EmailOutbox" WHERE (${options.onlyId ?? null}::text IS NULL OR id=${options.onlyId ?? null}) AND "sentAt" IS NULL AND "failedAt" IS NULL AND "availableAt" <= (now() AT TIME ZONE 'UTC') AND ("expiresAt" IS NULL OR "expiresAt">(now() AT TIME ZONE 'UTC')) AND ("lockedAt" IS NULL OR "lockedAt"<(now() AT TIME ZONE 'UTC')-interval '5 minutes') ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
      const row = rows[0];
      if (!row) break;
      let valid = true;
      if (row.dedupeKey?.startsWith("account:"))
        valid = !!(await client.accountToken.count({
          where: {
            id: row.dedupeKey.slice(8),
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        }));
      if (row.dedupeKey?.startsWith("invite:")) {
        const [, id, hash] = row.dedupeKey.split(":");
        valid = !!(await client.staffInvitation.count({
          where: {
            id,
            tokenHash: hash,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }));
      }
      if (!valid) {
        await client.emailOutbox.updateMany({
          where: { id: row.id, lockedBy: lease },
          data: {
            failedAt: new Date(),
            lastError: "Link no longer valid",
            encryptedText: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        continue;
      }
      try {
        if (
          row.pilotEnrollmentId ||
          row.dedupeKey?.startsWith("pilot-invite:")
        ) {
          if (await deliverPilotMail(client, row, lease, send)) sent++;
          continue;
        }
        await send({
          to: row.to,
          subject: row.subject,
          text: row.encryptedText ? decryptMail(row.encryptedText) : row.text,
          messageId: `<${row.id}@mail.buzlike.com>`,
        });
        await client.emailOutbox.updateMany({
          where: { id: row.id, lockedBy: lease },
          data: {
            sentAt: new Date(),
            encryptedText: null,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
        sent++;
      } catch {
        await client.emailOutbox.updateMany({
          where: { id: row.id, lockedBy: lease },
          data: {
            lockedAt: null,
            lockedBy: null,
            lastError: "SMTP delivery failed",
            failedAt: row.attempts >= 8 ? new Date() : null,
            availableAt: new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** (row.attempts - 1)),
            ),
          },
        });
        failed++;
      }
    }
  } finally {
    transport?.close();
  }
  return { state: "processed", sent, failed };
}
