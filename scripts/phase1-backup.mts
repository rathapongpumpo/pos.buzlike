import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { databaseFingerprint } from "./lib/database-fingerprint";
import { fileFingerprint } from "./lib/file-fingerprint";
import { existsSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error(
    "This backup command is restricted to the local migration workspace",
  );
const directory = path.resolve("data/backups");
await mkdir(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const phase = ["phase1", "phase2", "phase3", "pilot-a", "pilot-d"].includes(
  process.argv[2],
)
  ? process.argv[2]
  : "phase1";
const file = path.join(directory, `pre-${phase}-${stamp}`);
const snapshot =
  await db.$queryRaw`SELECT (SELECT count(*)::int FROM "Tenant") AS tenants, (SELECT count(*)::int FROM "Order") AS orders, (SELECT coalesce(sum("grandTotal"),0)::text FROM "Order") AS order_total, (SELECT count(*)::int FROM "User") AS users, (SELECT count(*)::int FROM "Product") AS products, (SELECT coalesce(sum("directStockQty"),0)::bigint::text FROM "Product") AS stock_total`;
const fingerprint = phase === "pilot-d" ? await databaseFingerprint(db) : undefined;
await db.$disconnect();
const data = path.resolve("data/postgres");
if (
  !data.startsWith(path.resolve("data") + path.sep) ||
  !file.startsWith(directory + path.sep)
)
  throw new Error("Backup path outside local data workspace");
const ctl = path.resolve(
  "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",
);
execFileSync(ctl, ["stop", "-D", data, "-m", "fast", "-w"], { stdio: "pipe" });
try {
  await cp(data, file, { recursive: true, errorOnExist: true, force: false });
  await writeFile(file + ".json", JSON.stringify(snapshot, null, 2));
  if (fingerprint) {
    const slips=path.resolve("data/slips");
    if(existsSync(slips))await cp(slips,file+".slips",{recursive:true,errorOnExist:true,force:false});
    await writeFile(file+".manifest.json",JSON.stringify({kind:"local-clean-shutdown",postgresMajor:17,fingerprint,slips:await fileFingerprint(slips)},null,2));
  }
} finally {
  execFileSync(
    ctl,
    [
      "start",
      "-D",
      data,
      "-o",
      `-h 127.0.0.1 -p ${url.port}`,
      "-l",
      path.resolve("data/backup-postgres-start.log"),
      "-w",
    ],
    { stdio: "ignore" },
  );
}
console.log(
  JSON.stringify({
    backup: file,
    kind: "clean-shutdown physical copy",
    snapshot,
  }),
);
