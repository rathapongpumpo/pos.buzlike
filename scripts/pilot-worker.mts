import "dotenv/config";
import { db } from "../src/lib/db";
import { runPilotMaintenance } from "../src/lib/pilot-operations";
import { workerRun } from "../src/lib/operations";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
try {
  do {
    try {
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          ...(await workerRun("pilot", runPilotMaintenance)),
        }),
      );
    } catch {
      console.error("Pilot maintenance failed; retrying");
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (!stopping && !process.argv.includes("--once"))
      await new Promise((r) => setTimeout(r, 30000));
  } while (!stopping && !process.argv.includes("--once"));
} finally {
  await db.$disconnect();
}
