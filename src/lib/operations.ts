import { timingSafeEqual, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { db } from "./db";
export function operationsAuthorized(req: Request) {
  const expected = process.env.OPERATIONS_TOKEN;
  const actual = req.headers.get("authorization");
  if (!expected || expected.length < 32 || !actual) return false;
  const wanted = Buffer.from(`Bearer ${expected}`),
    supplied = Buffer.from(actual);
  return wanted.length === supplied.length && timingSafeEqual(wanted, supplied);
}
export async function outboundAllowed(client: PrismaClient = db) {
  if (
    process.env.RESTORE_DRILL === "true" ||
    process.env.OUTBOUND_EMAIL_ENABLED === "false"
  )
    return false;
  const control = await client.operationalControl.findUnique({
    where: { id: "platform" },
  });
  // Missing control is an incomplete migration, not permission to deliver.
  return !!control && !control.outboundQuarantinedAt;
}
export async function workerRun<T>(
  name: "email" | "pilot" | "monitor",
  run: () => Promise<T>,
  options: { client?: PrismaClient; disabled?: boolean } = {},
) {
  const client = options.client ?? db,
    now = new Date();
  await client.workerHeartbeat.upsert({
    where: { name },
    create: { name, state: "RUNNING", lastAttemptAt: now },
    update: { state: "RUNNING", lastAttemptAt: now },
  });
  try {
    const value = await run();
    await client.workerHeartbeat.update({
      where: { name },
      data: {
        state: options.disabled ? "DISABLED" : "OK",
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
      },
    });
    return value;
  } catch (error) {
    await client.workerHeartbeat
      .update({
        where: { name },
        data: {
          state: "ERROR",
          lastFailureAt: new Date(),
          consecutiveFailures: { increment: 1 },
        },
      })
      .catch(() => {});
    throw error;
  }
}
export async function operationalStatus(
  client: PrismaClient = db,
  now = Date.now(),
) {
  const [heartbeats, pending, failed, oldest, control] = await Promise.all([
    client.workerHeartbeat.findMany({
      where: { name: { in: ["email", "pilot"] } },
    }),
    client.emailOutbox.count({
      where: {
        sentAt: null,
        failedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
    }),
    client.emailOutbox.count({
      where: {
        sentAt: null,
        failedAt: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
    }),
    client.emailOutbox.findFirst({
      where: {
        sentAt: null,
        failedAt: null,
        availableAt: { lte: new Date(now) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
    client.operationalControl.findUnique({ where: { id: "platform" } }),
  ]);
  const workers = ["email", "pilot"].map((name) => {
    const h = heartbeats.find((row) => row.name === name),
      stale = !h?.lastSuccessAt || now - +h.lastSuccessAt > 120000;
    return {
      name,
      state: h?.state ?? "MISSING",
      stale,
      consecutiveFailures: h?.consecutiveFailures ?? 0,
      lastSuccessAt: h?.lastSuccessAt?.toISOString() ?? null,
    };
  });
  const lagSeconds = oldest
    ? Math.max(0, Math.floor((now - +oldest.availableAt) / 1000))
    : 0;
  const alerts: string[] = [];
  for (const w of workers)
    if (w.stale || w.state === "ERROR" || w.state === "DISABLED")
      alerts.push(
        `WORKER_${w.name.toUpperCase()}_${w.stale ? "STALE" : w.state}`,
      );
  if (failed) alerts.push("MAIL_DEAD_LETTERS");
  if (lagSeconds > 300) alerts.push("MAIL_QUEUE_LAG");
  if (!control || control.outboundQuarantinedAt)
    alerts.push("OUTBOUND_QUARANTINED");
  return {
    ok: !alerts.length,
    workers,
    mail: { pending, failed, lagSeconds },
    alerts,
  };
}
export function safeServerError(error: unknown) {
  const requestId = randomUUID();
  const category =
    error instanceof Error && /^[A-Za-z0-9_]{1,60}$/.test(error.name)
      ? error.name
      : "UnknownError";
  // No URLs, query strings, payloads, SQL, email addresses or provider error messages.
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
  } | null;
  const code =
    typeof candidate?.code === "string" && /^P\d{4}$/.test(candidate.code)
      ? candidate.code
      : undefined;
  const sqlState =
    typeof candidate?.meta?.code === "string" &&
    /^[A-Z0-9]{5}$/.test(candidate.meta.code)
      ? candidate.meta.code
      : undefined;
  console.error(
    JSON.stringify({
      event: "request_failed",
      requestId,
      category,
      code,
      sqlState,
    }),
  );
  return requestId;
}
