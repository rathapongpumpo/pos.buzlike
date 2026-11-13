import { PrismaClient, Prisma } from "@prisma/client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
export function retryableTransaction(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return (
      ["P2034", "P2002"].includes(error.code) ||
      (error.code === "P2010" &&
        ["40001", "40P01", "1213", "1205", "1020"].includes(
          String(error.meta?.code),
        ))
    );
  // MariaDB may report optimistic InnoDB conflicts through an unclassified connector error.
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /Record has changed since last read|Deadlock found when trying to get lock|Lock wait timeout exceeded/i.test(
      error.message,
    )
  );
}
export async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (e) {
      if (retryableTransaction(e) && n < 8) {
        // Spread retries so simultaneous tills do not immediately collide again.
        // The entire transaction is retried; callers must keep external side
        // effects outside this callback.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(250, 10 * 2 ** n) + Math.random() * 25),
        );
        continue;
      }
      throw e;
    }
  }
}
