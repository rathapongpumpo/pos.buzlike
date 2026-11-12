import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { saleAccessBlocked } from "../src/lib/pilot-access";
import { replayMatchesScope } from "../src/lib/offline-scope";
test("Pilot A offline: a cached ACTIVE grant expires locally and missing deadlines fail closed", () => {
  const data = {
    state: "ACTIVE",
    entitlement: {
      source: "PILOT" as const,
      profile: "PILOT_PRO_V1",
      state: "ACTIVE",
      endsAt: new Date(100).toISOString(),
    },
  };
  assert.equal(saleAccessBlocked(data, 99), false);
  assert.equal(saleAccessBlocked(data, 100), true);
  assert.equal(
    saleAccessBlocked(
      { ...data, entitlement: { ...data.entitlement, endsAt: null } },
      0,
    ),
    true,
  );
  assert.equal(
    saleAccessBlocked(
      { ...data, entitlement: { ...data.entitlement, endsAt: "invalid" } },
      0,
    ),
    true,
  );
  assert.equal(saleAccessBlocked({ state: "READ_ONLY" }), true);
  assert.equal(saleAccessBlocked({ state: "SUSPENDED" }), true);
  assert.equal(
    saleAccessBlocked(
      {
        state: "PAST_DUE",
        entitlement: { ...data.entitlement, source: "PAID" },
      },
      101,
    ),
    false,
  );
});
test("Pilot A offline: denied replay retains the exact queued cash bill for review; only confirmed success removes it", async () => {
  const key = "owner:shop:branch:operator",
    id = "cash-bill";
  const original = {
    id,
    key,
    slug: "shop",
    status: "pending",
    input: {
      branchId: "branch",
      operatorId: "operator",
      clientOrderId: id,
      items: [{ productId: "product", quantity: 1 }],
    },
  };
  const rows = new Map([[id, original]]);
  class DexieStub {
    queue = {
      where: () => ({
        equals: () => ({ toArray: async () => [...rows.values()] }),
      }),
      delete: async (key: string) => rows.delete(key),
      update: async (key: string, patch: Partial<typeof original>) => {
        const row = rows.get(key);
        if (row) rows.set(key, { ...row, ...patch });
      },
    };
    version() {
      return { stores: () => this };
    }
  }
  let status = 402;
  const exports: { syncQueue?: (key: string) => Promise<string[]> } = {};
  const source = ts.transpileModule(
    await readFile("src/lib/offline-queue.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      if (name === "dexie") return { default: DexieStub };
      if (name === "./offline-scope") return { replayMatchesScope };
      throw new Error("Unexpected dependency: " + name);
    },
    fetch: async () =>
      new Response(JSON.stringify({ error: "Pilot access expired" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await exports.syncQueue!(key);
  assert.equal(rows.get(id)?.status, "conflict");
  assert.deepEqual(rows.get(id)?.input, original.input);
  rows.set(id, { ...rows.get(id)!, status: "pending" });
  status = 200;
  await exports.syncQueue!(key);
  assert.equal(rows.has(id), false);
});
