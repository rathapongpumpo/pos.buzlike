import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";

test("v2 SQL blueprint: tenant/branch FKs, isolated stock/prices, dedup and refund provenance", async () => {
  const rollback = new Error("ROLLBACK_ARCHITECTURE_TEST");
  const schema = `v2_design_${randomUUID().replaceAll("-", "")}`;
  const ddl = readFileSync("docs/architecture/pos-saas-v2.sql", "utf8")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  let verified = false;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        for (const statement of ddl) await tx.$executeRawUnsafe(statement);
        async function rejects(sql: string, code: string) {
          await tx.$executeRawUnsafe("SAVEPOINT invalid_row");
          await assert.rejects(
            tx.$executeRawUnsafe(sql),
            (error: unknown) =>
              typeof error === "object" &&
              error !== null &&
              "meta" in error &&
              (error.meta as { code?: string })?.code === code,
          );
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_row");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT invalid_row");
        }
        await tx.$executeRawUnsafe(
          "INSERT INTO app_user(id,email,full_name) VALUES ('u','owner@example.test','Owner')",
        );
        await rejects(
          "INSERT INTO app_user(email,full_name) VALUES ('OWNER@example.test','Duplicate')",
          "23514",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO organization(id,name,slug,business_profile) VALUES ('a','A','a','RETAIL'),('b','B','b','CAFE')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO organization_member(organization_id,id,user_id,display_name,organization_role) VALUES ('a','ma','u','Owner','OWNER'),('b','mb','u','Owner','OWNER')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO branch(organization_id,id,code,name) VALUES ('a','a1','1','A1'),('a','a2','2','A2'),('b','b1','1','B1')",
        );
        await rejects(
          "INSERT INTO branch_access VALUES ('a','b1','ma','CASHIER')",
          "23503",
        );
        await rejects(
          "INSERT INTO branch_access VALUES ('a','a1','mb','CASHIER')",
          "23503",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO category(organization_id,id,name) VALUES ('a','ca','A'),('b','cb','B')",
        );
        await rejects(
          "INSERT INTO product(organization_id,id,category_id,name) VALUES ('a','bad','cb','Cross tenant')",
          "23503",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO product(organization_id,id,category_id,name) VALUES ('a','pa','ca','A'),('b','pb','cb','B')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO product_variant(organization_id,id,product_id,sku,default_price_minor) VALUES ('a','va','pa','SKU-1',5000),('b','vb','pb','SKU-1',7000)",
        );
        await rejects(
          "INSERT INTO product_variant(organization_id,product_id,sku,default_price_minor) VALUES ('a','pa','SKU-1',5000)",
          "23505",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO branch_offer(organization_id,branch_id,variant_id,channel,price_minor) VALUES ('a','a1','va','POS',5000),('a','a2','va','POS',6000)",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO stock_item(organization_id,id,sku,name,base_unit,kind) VALUES ('a','sa','SKU-1','A','piece','FINISHED')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO inventory_location(organization_id,branch_id,id,name,kind) VALUES ('a','a1','l1','Shelf 1','STORE'),('a','a2','l2','Shelf 2','STORE')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO stock_balance(organization_id,location_id,stock_item_id,quantity_base) VALUES ('a','l1','sa',10),('a','l2','sa',20)",
        );
        await tx.$executeRawUnsafe(
          "UPDATE stock_balance SET quantity_base=quantity_base-1 WHERE organization_id='a' AND location_id='l1' AND stock_item_id='sa'",
        );
        const balances = await tx.$queryRawUnsafe<
          { quantity_base: { toString(): string } }[]
        >("SELECT quantity_base FROM stock_balance ORDER BY location_id");
        assert.deepEqual(
          balances.map((s) => String(s.quantity_base)),
          ["9", "20"],
        );
        const prices = await tx.$queryRawUnsafe<{ price_minor: bigint }[]>(
          "SELECT price_minor FROM branch_offer ORDER BY branch_id",
        );
        assert.deepEqual(
          prices.map((p) => p.price_minor),
          [5000n, 6000n],
        );
        await rejects(
          "UPDATE stock_balance SET quantity_base=-1 WHERE location_id='l1'",
          "23514",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO terminal(organization_id,branch_id,id,device_key_hash,name) VALUES ('a','a1','t1','hash-1','Till')",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO cashier_shift(organization_id,branch_id,id,terminal_id,member_id,starting_cash_minor) VALUES ('a','a1','sh1','t1','ma',0)",
        );
        const sale = (
          id: string,
          branch: string,
          client: string,
          shift = "NULL",
        ) =>
          `INSERT INTO sale(organization_id,branch_id,id,shift_id,client_order_id,request_hash,order_number,channel,status,business_date,subtotal_minor,total_minor,tax_snapshot) VALUES ('a','${branch}','${id}',${shift},'${client}','hash','${id}','POS','OPEN',CURRENT_DATE,5000,5000,'{}')`;
        await tx.$executeRawUnsafe(sale("s1", "a1", "c1", "'sh1'"));
        await tx.$executeRawUnsafe(sale("s2", "a1", "c2"));
        await rejects(
          "INSERT INTO stock_movement(organization_id,branch_id,location_id,stock_item_id,kind,quantity_delta,balance_after,operation_key,reference_sale_id) VALUES ('a','a1','l2','sa','SALE',-1,19,'wrong-branch-stock','s1')",
          "23503",
        );
        await rejects(sale("s3", "a2", "c3", "'sh1'"), "23503");
        await rejects(sale("s4", "a2", "c1"), "23505");
        await tx.$executeRawUnsafe(
          "INSERT INTO sale_line(organization_id,branch_id,id,sale_id,variant_id,product_name_snapshot,sku_snapshot,unit_price_minor,quantity,subtotal_minor,total_minor) VALUES ('a','a1','sl1','s1','va','A','SKU-1',5000,1,5000,5000)",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO refund(organization_id,branch_id,id,sale_id,request_key,amount_minor,reason,status) VALUES ('a','a1','r2','s2','refund-2',5000,'Test','PENDING')",
        );
        await rejects(
          "INSERT INTO refund_line VALUES ('a','a1','r2','s2','sl1',1,5000,false)",
          "23503",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO billing_invoice(organization_id,id,invoice_number,cycle_key,status,subtotal_minor,total_minor,customer_snapshot) VALUES ('a','i1','I1','initial-1','OPEN',39000,39000,'{}')",
        );
        await rejects(
          "INSERT INTO payment_attempt(organization_id,invoice_id,request_key,request_hash,provider,method,status,amount_minor) VALUES ('b','i1','k','h','stripe','CARD','PENDING',39000)",
          "23503",
        );
        await tx.$executeRawUnsafe(
          "INSERT INTO billing_webhook_inbox(provider,provider_account,event_id,event_type,payload) VALUES ('stripe','account','event-1','invoice.paid','{}')",
        );
        await rejects(
          "INSERT INTO billing_webhook_inbox(provider,provider_account,event_id,event_type,payload) VALUES ('stripe','account','event-1','invoice.paid','{}')",
          "23505",
        );
        verified = true;
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.ok(verified);
  const schemas = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM pg_namespace WHERE nspname = ${schema}`;
  assert.equal(
    Number(schemas[0].n),
    0,
    "Temporary design schema must be rolled back",
  );
});
