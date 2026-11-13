import "dotenv/config";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { backupKey, encryptBackup } from "./lib/backup-crypto";

const url = new URL(process.env.DATABASE_URL!);
if (url.protocol !== "mysql:") throw Error("MySQL DATABASE_URL required");
const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);
const root = path.resolve("data/backups");
await mkdir(root, { recursive: true });
const file = path.join(
  root,
  `mysql-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.enc`,
);
const options = path.join(root, `.mysql-options-${randomUUID()}.cnf`);
const quoted = (value: string) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\r", "\\r")}"`;
await writeFile(
  options,
  `[client]\nhost=${quoted(url.hostname)}\nport=${Number(url.port || 3306)}\nuser=${quoted(decodeURIComponent(url.username))}\npassword=${quoted(decodeURIComponent(url.password))}\nprotocol=tcp\n`,
  { mode: 0o600, flag: "wx" },
);
try {
  const child = spawn(
    process.env.MYSQL_DUMP_BINARY || "mariadb-dump",
    [
      `--defaults-extra-file=${options}`,
      "--single-transaction",
      "--quick",
      "--routines",
      "--triggers",
      "--hex-blob",
      "--no-tablespaces",
      "--skip-add-locks",
      decodeURIComponent(url.pathname.slice(1)),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.on("data", () => {});
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const encrypted = encryptBackup(child.stdout, file, key);
  try {
    await Promise.all([
      encrypted,
      closed.then((code) => {
        if (code !== 0) throw Error("Dump failed");
      }),
    ]);
    await writeFile(
      file + ".json",
      JSON.stringify(
        {
          format: "MariaDB/MySQL SQL dump, AES-256-GCM",
          createdAt: new Date().toISOString(),
          keyId: process.env.BACKUP_KEY_ID ?? "unspecified",
          includes:
            "Database and triggers; back up private slip storage separately",
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
    throw Error("MySQL backup failed; no usable archive published");
  }
} finally {
  await unlink(options).catch(() => {});
}
