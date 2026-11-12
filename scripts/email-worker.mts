import "dotenv/config";
import { db } from "../src/lib/db";
import { flushEmailOutbox } from "../src/lib/email-outbox";
import { outboundAllowed, workerRun } from "../src/lib/operations";
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
      const allowed = await outboundAllowed();
      const result = await workerRun(
        "email",
        async () => {
          const result = await flushEmailOutbox();
          if (result.state === "not_configured" || result.failed)
            throw new Error("Email worker not ready");
          return result;
        },
        { disabled: !allowed },
      );
      const deadLetters = await db.emailOutbox.count({
        where: { sentAt: null, failedAt: { not: null } },
      });
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          ...result,
          deadLetters,
        }),
      );
    } catch {
      console.error("Email worker failed; retrying");
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (!process.argv.includes("--once") && !stopping)
      await new Promise((r) => setTimeout(r, 5000));
  } while (!process.argv.includes("--once") && !stopping);
} finally {
  await db.$disconnect();
}
