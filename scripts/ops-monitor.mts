import "dotenv/config";
import { db } from "../src/lib/db";
import { operationalStatus, workerRun } from "../src/lib/operations";
let stopping = false,
  last = "";
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  do {
    try {
      const status = await workerRun("monitor", () => operationalStatus());
      const signature = status.alerts.slice().sort().join(",");
      if (signature !== last || process.argv.includes("--once")) {
        const event = {
          at: new Date().toISOString(),
          event: signature ? "operations_alert" : "operations_recovered",
          ...status,
        };
        (signature ? console.error : console.log)(JSON.stringify(event));
      }
      last = signature;
      if (!status.ok && process.argv.includes("--once")) process.exitCode = 1;
    } catch {
      console.error(
        JSON.stringify({
          event: "operations_alert",
          alerts: ["DATABASE_UNAVAILABLE"],
        }),
      );
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (!stopping && !process.argv.includes("--once"))
      await new Promise((r) => setTimeout(r, 30000));
  } while (!stopping && !process.argv.includes("--once"));
} finally {
  await db.$disconnect();
}
