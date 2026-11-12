import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local preservation check only");
try {
  const pilot = process.argv.includes("--pilot-a");
  const prefix = pilot ? "pre-pilot-a-" : "pre-phase3-";
  const files = (await readdir("data/backups"))
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  assert(files.length, "Missing phase baseline");
  const [baseline] = JSON.parse(
    await readFile(`data/backups/${files.at(-1)}`, "utf8"),
  );
  const [tenants, orders, users, products, sales, stock] = await Promise.all([
    db.tenant.count(),
    db.order.count(),
    db.user.count(),
    db.product.count(),
    db.order.aggregate({ _sum: { grandTotal: true } }),
    db.product.aggregate({ _sum: { directStockQty: true } }),
  ]);
  const actual = {
    tenants,
    orders,
    order_total: Number(sales._sum.grandTotal ?? 0).toFixed(2),
    users,
    products,
    stock_total: String(stock._sum.directStockQty ?? 0),
  };
  assert.deepEqual(
    actual,
    baseline,
    "Existing business totals changed or test fixtures remain",
  );
  const evidence = {
    checkedAt: new Date().toISOString(),
    baselineFile: `data/backups/${files.at(-1)}`,
    before: baseline,
    after: actual,
    preserved: true,
  };
  await writeFile(
    pilot
      ? "docs/phases/evidence/pilot-a-data.json"
      : "docs/phases/evidence/phase3-data.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
} finally {
  await db.$disconnect();
}
