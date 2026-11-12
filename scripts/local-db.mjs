import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Local DB script only supports loopback.");
const pg = new EmbeddedPostgres({
  databaseDir: "data/postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port),
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync("data/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const db = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(db)) throw new Error("Invalid local database name");
const found = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
  db,
]);
if (!found.rowCount) await client.query(`CREATE DATABASE "${db}"`);
await client.end();
console.log(
  `PostgreSQL ready on 127.0.0.1:${url.port} (persistent data/postgres)`,
);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
