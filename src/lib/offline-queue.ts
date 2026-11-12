"use client";
import Dexie, { type EntityTable } from "dexie";
import type { Bootstrap, CartLine } from "./view-types";
import type { OrderInput } from "./orders";
import { replayMatchesScope } from "./offline-scope";
export type QueuedSale = {
  id: string;
  key: string;
  slug: string;
  input: OrderInput;
  status: "pending" | "conflict";
  error?: string;
};
const local = new Dexie("buzlike-pos-v1") as Dexie & {
  catalog: EntityTable<{ key: string; data: Bootstrap }, "key">;
  queue: EntityTable<
    {
      id: string;
      key: string;
      slug: string;
      input: OrderInput;
      status: "pending" | "conflict";
      error?: string;
    },
    "id"
  >;
  held: EntityTable<
    { id: string; key: string; lines: CartLine[]; createdAt: string },
    "id"
  >;
};
local
  .version(1)
  .stores({ catalog: "key", queue: "id,key,status", held: "id,key" });
export const offline = local;
export async function syncQueue(key: string) {
  const results = [];
  for (const row of await local.queue.where("key").equals(key).toArray()) {
    if (row.status === "conflict") continue;
    if (!replayMatchesScope(key, row)) {
      await local.queue.update(row.id, {
        status: "conflict",
        error: "ข้อมูลสาขาหรือพนักงานไม่ตรง ต้องตรวจบิลก่อนส่ง",
      });
      continue;
    }
    try {
      const res = await fetch(`/api/v1/${row.slug}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify(row.input),
      });
      if (res.ok) {
        await local.queue.delete(row.id);
        results.push(row.id);
      } else {
        const body = await res.json();
        if (res.status === 401) break;
        await local.queue.update(row.id, {
          status: "conflict",
          error: body.error ?? "ซิงก์ไม่สำเร็จ",
        });
      }
    } catch {
      break;
    }
  }
  return results;
}
