import "dotenv/config";
import path from "node:path";
import { mkdir, realpath } from "node:fs/promises";
import { backupKey, decryptBackup } from "./lib/backup-crypto";
const root = await realpath(path.resolve("data/backups")),
  input = await realpath(path.resolve(process.argv[2] ?? ""));
if (!input.startsWith(root + path.sep))
  throw Error("Input must be in workspace data/backups");
const targetRoot = path.resolve("data/restore-drills");
await mkdir(targetRoot, { recursive: true });
const output = path.join(
  targetRoot,
  `decrypted-${new Date().toISOString().replace(/[:.]/g, "-")}${input.endsWith(".sql.enc") ? ".sql" : ".pgdump"}`,
);
await decryptBackup(
  input,
  output,
  backupKey(process.env.BACKUP_ENCRYPTION_KEY),
);
console.log(
  JSON.stringify({
    output,
    warning:
      "Private plaintext archive; restore only into an isolated target and quarantine all outbound jobs",
  }),
);
