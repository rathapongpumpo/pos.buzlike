import { PrismaClient, Prisma } from "@prisma/client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
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
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(e.code) ||
          (e.code === "P2010" &&
            ["40001", "40P01"].includes(String(e.meta?.code)))) &&
        n < 8
      ) {
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
