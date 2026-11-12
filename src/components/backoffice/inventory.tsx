"use client";
import { useState } from "react";
import { Plus, Download, FlaskConical, ArrowDownUp } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { PageTitle, FormModal, fString, fNumber } from "./shared";
import { money } from "@/lib/money";
import Link from "next/link";
export function Inventory() {
  const { data, slug, action, notify } = useStore();
  const [mode, setMode] = useState(""),
    [ingredientId, setIngredientId] = useState(""),
    [productId, setProductId] = useState(data.products[0]?.id ?? ""),
    [recipe, setRecipe] = useState<Record<string, string>>({});
  const low = data.ingredients.filter(
    (i) =>
      Number(i.branchStocks[0]?.currentQty ?? 0) <= Number(i.lowStockThreshold),
  );
  return (
    <>
      <PageTitle
        title="คลังวัตถุดิบ"
        description={`${data.ingredients.length} วัตถุดิบ · ${low.length} รายการถึงจุดสั่งซื้อ`}
      >
        {data.tenant.enableRecipeBom ? (
          <Button
            variant="outline"
            onClick={() => {
              setRecipe({});
              setMode("recipe");
            }}
          >
            <FlaskConical size={17} />
            สูตร BOM
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={`/${slug}/billing?branchId=${data.branch.id}`}>
              <FlaskConical size={17} />
              สูตร BOM · อัปเกรด Pro
            </Link>
          </Button>
        )}
        <Button onClick={() => setMode("new")}>
          <Plus size={17} />
          วัตถุดิบ
        </Button>
      </PageTitle>
      <div className="panel table-scroll" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>วัตถุดิบ</th>
              <th>รหัส</th>
              <th className="number">คงเหลือ</th>
              <th>หน่วย</th>
              <th className="number">จุดสั่งซื้อ</th>
              <th>สถานะ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.ingredients.map((i) => {
              const qty = Number(i.branchStocks[0]?.currentQty ?? 0);
              return (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                  </td>
                  <td className="font-mono">{i.sku}</td>
                  <td className="number">{money(qty)}</td>
                  <td>{i.unit}</td>
                  <td className="number">{money(i.lowStockThreshold)}</td>
                  <td>
                    <span
                      className={`pill ${qty <= Number(i.lowStockThreshold) ? "orange" : ""}`}
                    >
                      {qty <= Number(i.lowStockThreshold)
                        ? "ถึงจุดสั่งซื้อ"
                        : "เพียงพอ"}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIngredientId(i.id);
                        setMode("adjust");
                      }}
                    >
                      <ArrowDownUp size={15} />
                      รับเข้า / ปรับยอด
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row between section-space">
        <h2>ประวัติความเคลื่อนไหว</h2>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/v1/${slug}/reports/export?type=stock&branchId=${data.branch.id}`}
          >
            <Download size={15} />
            ส่งออก CSV
          </a>
        </Button>
      </div>
      <div className="panel table-scroll section-space" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>วันเวลา</th>
              <th>วัตถุดิบ</th>
              <th>ประเภท</th>
              <th className="number">เปลี่ยนแปลง</th>
              <th className="number">คงเหลือ</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {data.stockMovements.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.createdAt).toLocaleString("th-TH")}</td>
                <td>{m.ingredient.name}</td>
                <td>
                  {(
                    {
                      INBOUND: "รับเข้า",
                      SALE_DEDUCTION: "ขายสินค้า",
                      VOID_RETURN: "คืนจากยกเลิก",
                      WASTE: "ของเสีย",
                      ADJUST: "ปรับยอด",
                    } as Record<string, string>
                  )[m.type] ?? m.type}
                </td>
                <td
                  className="number"
                  style={{
                    color:
                      Number(m.quantityChange) < 0
                        ? "var(--danger)"
                        : "var(--success)",
                  }}
                >
                  {Number(m.quantityChange) > 0 ? "+" : ""}
                  {money(m.quantityChange)}
                </td>
                <td className="number">{money(m.balanceAfter)}</td>
                <td>{m.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.stockMovements.length && (
          <div className="empty">ยังไม่มีความเคลื่อนไหว</div>
        )}
      </div>
      {mode === "new" && (
        <FormModal
          title="เพิ่มวัตถุดิบ"
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            await action("ingredients", {
              name: fString(f, "name"),
              sku: fString(f, "sku"),
              unit: fString(f, "unit"),
              costPerUnit: fNumber(f, "cost"),
              lowStockThreshold: fNumber(f, "low"),
            });
            notify("เพิ่มวัตถุดิบแล้ว");
          }}
        >
          <label className="field">
            ชื่อวัตถุดิบ
            <input name="name" required />
          </label>
          <div className="grid2">
            <label className="field">
              รหัส
              <input name="sku" required />
            </label>
            <label className="field">
              หน่วย
              <input name="unit" placeholder="g / ml / ชิ้น" required />
            </label>
            <label className="field">
              ต้นทุนต่อหน่วย
              <input
                name="cost"
                type="number"
                step="0.0001"
                min="0"
                defaultValue="0"
              />
            </label>
            <label className="field">
              จุดสั่งซื้อ
              <input name="low" type="number" min="0" defaultValue="500" />
            </label>
          </div>
        </FormModal>
      )}
      {mode === "adjust" && (
        <FormModal
          title={`ปรับสต็อก · ${data.ingredients.find((i) => i.id === ingredientId)?.name}`}
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            const type = fString(f, "type");
            await action("inventory/adjust", {
              ingredientId,
              type,
              quantity:
                type === "WASTE"
                  ? -Math.abs(fNumber(f, "qty"))
                  : fNumber(f, "qty"),
              note: fString(f, "note"),
            });
            notify("บันทึกสต็อกแล้ว");
          }}
        >
          <label className="field">
            ประเภท
            <select name="type">
              <option value="INBOUND">รับเข้า</option>
              <option value="ADJUST">ปรับเพิ่ม / ลด</option>
              <option value="WASTE">ของเสีย</option>
            </select>
          </label>
          <label className="field">
            จำนวนเปลี่ยนแปลง
            <input name="qty" type="number" step="0.01" required />
            <small>ปรับลดใช้ค่าลบ · ของเสียระบบจะหักให้อัตโนมัติ</small>
          </label>
          <label className="field">
            เหตุผล
            <input name="note" minLength={3} required />
          </label>
        </FormModal>
      )}
      {mode === "recipe" && (
        <FormModal
          title="สูตรวัตถุดิบ (BOM)"
          onClose={() => setMode("")}
          onSubmit={async () => {
            const p = data.products.find((p) => p.id === productId);
            await action("recipes", {
              productId,
              items: data.ingredients
                .map((i) => ({
                  ingredientId: i.id,
                  quantityUsed: Number(
                    recipe[i.id] ??
                      p?.recipeItems.find((r) => r.ingredientId === i.id)
                        ?.quantityUsed ??
                      0,
                  ),
                }))
                .filter((i) => i.quantityUsed > 0),
            });
            notify("บันทึกสูตรแล้ว");
          }}
        >
          <label className="field">
            สินค้า
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setRecipe({});
              }}
            >
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <small>ปริมาณใช้ต่อสินค้า 1 หน่วย · ใส่ 0 เพื่อนำออกจากสูตร</small>
          {data.ingredients.map((i) => (
            <label className="field" key={i.id}>
              {i.name} ({i.unit})
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  recipe[i.id] ??
                  data.products
                    .find((p) => p.id === productId)
                    ?.recipeItems.find((r) => r.ingredientId === i.id)
                    ?.quantityUsed ??
                  "0"
                }
                onChange={(e) =>
                  setRecipe((s) => ({ ...s, [i.id]: e.target.value }))
                }
              />
            </label>
          ))}
        </FormModal>
      )}
    </>
  );
}
