import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupKey, encryptBackup } from "./lib/backup-crypto";
const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY),
  root = path.resolve("data/backups");
await mkdir(root, { recursive: true });
const file = path.join(
  root,
  `production-${new Date().toISOString().replace(/[:.]/g, "-")}.pgdump.enc`,
);
const child = spawn(
  "docker",
  [
    "compose",
    "--env-file",
    ".env.production",
    "-f",
    "compose.production.yaml",
    "exec",
    "-T",
    "db",
    "pg_dump",
    "--username=buzlike",
    "--dbname=buzlike",
    "--format=custom",
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
child.stderr.on("data", () => {}); // Provider/connection errors may contain credentials; emit a generic failure.
const closed = new Promise<number | null>((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
const encrypted = encryptBackup(child.stdout, file, key);
try {
  await Promise.all([
    encrypted,
    closed.then((code) => {
      if (code !== 0) throw Error("pg_dump failed; no usable backup published");
    }),
  ]);
  await writeFile(
    file + ".json",
    JSON.stringify(
      {
        format: "PostgreSQL custom archive, AES-256-GCM",
        createdAt: new Date().toISOString(),
        keyId: process.env.BACKUP_KEY_ID ?? "unspecified",
        includes: "Database only; back up slip volume separately",
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({ backup: file, encrypted: true, databaseOnly: true }),
  );
} catch {
  child.kill();
  await Promise.allSettled([closed, encrypted]);
  await unlink(file).catch(() => {});
  console.error(
    "Backup failed; inspect service readiness without printing connection strings",
  );
  process.exitCode = 1;
}
