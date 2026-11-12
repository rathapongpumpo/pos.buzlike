import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { planPrices } from "../src/lib/plan-pricing";
test("approved monthly/yearly prices are stored in the checkout Plan catalog", async () => {
  for (const [code, price] of [
    ["STARTER_MONTHLY", 199],
    ["PRO_MONTHLY", 499],
    ["STARTER_YEARLY", 1990],
    ["PRO_YEARLY", 4990],
  ] as const) {
    const plan = await db.plan.findUniqueOrThrow({ where: { code } });
    assert.equal(Number(plan.price), price);
    assert.equal(planPrices[code], price);
  }
});
after(() => db.$disconnect());
