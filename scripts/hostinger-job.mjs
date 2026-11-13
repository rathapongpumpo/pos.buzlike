// Run from a private source checkout that retains its devDependencies.
// hPanel managed Next.js artifacts prune tsx and do not include these source files.
import { tsImport } from "tsx/esm/api";
import { fileURLToPath } from "node:url";
import path from "node:path";
const jobs = {
  email: "email-worker.mts",
  pilot: "pilot-worker.mts",
  monitor: "ops-monitor.mts",
  backup: "ops-backup-mysql.mts",
};
const job = jobs[process.argv[2]];
if (!job) throw Error("Choose email, pilot, monitor or backup");
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.argv.push("--once");
await tsImport(`./${job}`, import.meta.url);
