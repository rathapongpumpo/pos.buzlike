import "dotenv/config";
import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { importStore } from "../src/lib/import-store";
const file = process.argv[2];
if (!file)
  throw new Error("Usage: npm run data:import -- path/to/store-export.json");
try {
  const result = await importStore(
    db,
    JSON.parse(await readFile(file, "utf8")),
    {
      email: process.env.IMPORT_OWNER_EMAIL ?? "",
      password: process.env.IMPORT_OWNER_PASSWORD ?? "",
      pin: process.env.IMPORT_OWNER_PIN ?? "",
    },
  );
  console.log(
    `Restored ${result.slug}: ${result.products} products, ${result.orders} orders. Staff must receive new PINs.`,
  );
} finally {
  await db.$disconnect();
}
