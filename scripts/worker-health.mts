import "dotenv/config";
import { db } from "../src/lib/db";
const name = process.argv[2];
try {
  if (!["email", "pilot", "monitor"].includes(name))
    throw Error("Unknown worker");
  const heartbeat = await db.workerHeartbeat.findUnique({ where: { name } });
  if (
    !heartbeat?.lastSuccessAt ||
    heartbeat.state !== "OK" ||
    Date.now() - +heartbeat.lastSuccessAt > 120000
  )
    process.exitCode = 1;
} finally {
  await db.$disconnect();
}
