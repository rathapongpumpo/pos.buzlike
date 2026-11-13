import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const provider =
  process.env.DATABASE_PROVIDER ??
  (process.env.DATABASE_URL?.startsWith("mysql:") ? "mysql" : "postgresql");
if (!["mysql", "postgresql"].includes(provider))
  throw Error("Unsupported DATABASE_PROVIDER");
if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL.startsWith("mysql:") !== (provider === "mysql")
)
  throw Error("DATABASE_PROVIDER does not match DATABASE_URL");
const schema =
  provider === "mysql" ? "prisma/mysql/schema.prisma" : "prisma/schema.prisma";
const cli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [cli, ...process.argv.slice(2), "--schema", schema],
  {
    stdio: "inherit",
    env: process.env,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
