import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export const mysqlDatabase = () =>
  process.env.DATABASE_URL?.startsWith("mysql:") ??
  process.env.DATABASE_PROVIDER === "mysql";

// Pick SQL fragments, never interpolate identifiers from a request.
export const dialectSql = (postgres: Prisma.Sql, mysql: Prisma.Sql) =>
  mysqlDatabase() ? mysql : postgres;

export async function databaseClock(client: Pick<Reader, "$queryRaw">) {
  const rows = await client.$queryRaw<{ now: Date }[]>(
    dialectSql(
      Prisma.sql`SELECT clock_timestamp() AS now`,
      Prisma.sql`SELECT UTC_TIMESTAMP(3) AS now`,
    ),
  );
  return rows[0].now;
}

export async function transactionLock(tx: Reader, key: string) {
  if (!mysqlDatabase()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    return;
  }
  // InnoDB releases this row lock on COMMIT/ROLLBACK. GET_LOCK is session based
  // and must not be used with Prisma's pooled transaction connections.
  const id = createHash("sha256").update(key).digest("hex");
  await tx.$executeRaw`INSERT INTO DatabaseMutex (id) VALUES (${id}) ON DUPLICATE KEY UPDATE id=VALUES(id)`;
  await tx.$queryRaw`SELECT id FROM DatabaseMutex WHERE id=${id} FOR UPDATE`;
}

export async function lockRow(
  tx: Reader,
  table: "PilotCampaign" | "PilotInvitation" | "PilotFeedback",
  id: string,
  campaignId?: string,
) {
  const identifier = Prisma.raw(
    mysqlDatabase() ? `\`${table}\`` : `"${table}"`,
  );
  const campaign =
    campaignId === undefined
      ? Prisma.empty
      : dialectSql(
          Prisma.sql`AND "campaignId"=${campaignId}`,
          Prisma.sql`AND campaignId=${campaignId}`,
        );
  return tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM ${identifier} WHERE id=${id} ${campaign} FOR UPDATE`,
  );
}

export async function copyBranchPrices(
  tx: Reader,
  tenantId: string,
  sourceId: string,
  destinationId: string,
) {
  return tx.$executeRaw(
    dialectSql(
      Prisma.sql`UPDATE "BranchProduct" dest SET price=src.price,"isAvailable"=src."isAvailable" FROM "BranchProduct" src WHERE dest."tenantId"=${tenantId} AND dest."branchId"=${destinationId} AND src."tenantId"=${tenantId} AND src."branchId"=${sourceId} AND src."productId"=dest."productId"`,
      Prisma.sql`UPDATE BranchProduct dest JOIN BranchProduct src ON src.tenantId=dest.tenantId AND src.productId=dest.productId SET dest.price=src.price, dest.isAvailable=src.isAvailable WHERE dest.tenantId=${tenantId} AND dest.branchId=${destinationId} AND src.branchId=${sourceId}`,
    ),
  );
}
