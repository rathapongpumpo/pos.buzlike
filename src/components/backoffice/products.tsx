"use client";
import { useState } from "react";
import { Plus, Search, Pencil, SlidersHorizontal } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { ProductImage } from "../product-image";
import { PageTitle, FormModal, fString, fNumber } from "./shared";
import { money } from "@/lib/money";
import type { ProductView } from "@/lib/view-types";
export function Products() {
  const { data, action, notify } = useStore();
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<ProductView | "new" | null>(null),
    [category, setCategory] = useState(false),
    [modifier, setModifier] = useState<ProductView | null>(null);
  const p = edit && edit !== "new" ? edit : null;
  return (
    <>
      <PageTitle
        title="สินค้าและเมนู"
        description={`${data.products.length} รายการ · โควตา ${data.tenant.maxProducts < 0 ? "ไม่จำกัด" : data.tenant.maxProducts}`}
      >
        <Button variant="outline" onClick={() => setCategory(true)}>
          เพิ่มหมวดหมู่
        </Button>
        <Button onClick={() => setEdit("new")}>
          <Plus size={18} />
          เพิ่มสินค้า
        </Button>
      </PageTitle>
      <p className="notice" style={{ marginBottom: 20 }}>
        ราคา เปิดขาย และจำนวนคงเหลือเป็นของสาขา {data.branch.name} · ชื่อ รหัส
        หมวดหมู่ และสูตรสินค้าใช้ร่วมทุกสาขา
      </p>
      <div className="search" style={{ maxWidth: 450, marginBottom: 20 }}>
        <Search size={20} />
        <input
          placeholder="ค้นหาชื่อสินค้า รหัส หรือบาร์โค้ด"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {data.products.length === 0 && (
        <div className="notice" style={{ marginBottom: 20 }}>
          เริ่มตั้งร้านของคุณ: เพิ่มหมวดหมู่ก่อน แล้วเพิ่มสินค้าและกำหนดราคาขาย
          เมื่อพร้อมจึงไปที่หน้าขายเพื่อเปิดกะและเริ่มขาย
        </div>
      )}
      <div className="panel table-scroll" style={{ padding: 0 }}>
        <table style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>รหัสสินค้า</th>
              <th>หมวดหมู่</th>
              <th className="number">ราคา</th>
              <th>สต็อก</th>
              <th>สถานะ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.products
              .filter((p) => `${p.name} ${p.sku} ${p.barcode}`.includes(search))
              .map((p) => (
                <tr key={p.id}>
                  <td style={{ minWidth: 220 }}>
                    <div className="product-mini">
                      <div>
                        <ProductImage image={p.imageUrl} name={p.name} />
                      </div>
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td className="font-mono">{p.sku}</td>
                  <td>{p.category.name}</td>
                  <td className="number">฿{money(p.price)}</td>
                  <td>
                    {p.trackStockType === "RECIPE"
                      ? "ตามสูตร BOM"
                      : p.trackStockType === "NONE"
                        ? "ไม่ตัดสต็อก"
                        : p.directStockQty}
                  </td>
                  <td>
                    <span className={`pill ${p.isAvailable ? "" : "gray"}`}>
                      {p.isAvailable ? "เปิดขาย" : "ปิดขาย"}
                    </span>
                  </td>
                  <td>
                    <div className="row">
                      <button
                        className="icon-button"
                        aria-label={`ตัวเลือก ${p.name}`}
                        onClick={() => setModifier(p)}
                      >
                        <SlidersHorizontal size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`แก้ไข ${p.name}`}
                        onClick={() => setEdit(p)}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <FormModal
          key={p?.id ?? "new"}
          title={p ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
          onClose={() => setEdit(null)}
          onSubmit={async (f) => {
            await action("products", {
              id: p?.id,
              name: fString(f, "name"),
              sku: fString(f, "sku"),
              barcode: fString(f, "barcode"),
              price: fNumber(f, "price"),
              categoryId: fString(f, "categoryId"),
              isAvailable: f.get("isAvailable") === "on",
              trackStockType: fString(f, "trackStockType"),
              directStockQty: fNumber(f, "directStockQty"),
              stockVersion: p?.stockVersion,
              stockReason: fString(f, "stockReason") || "ยอดตั้งต้นสินค้า",
            });
            notify("บันทึกสินค้าแล้ว");
          }}
        >
          <label className="field">
            ชื่อสินค้า
            <input
              name="name"
              defaultValue={p?.name}
              required
              maxLength={150}
            />
          </label>
          <div className="grid2">
            <label className="field">
              รหัสสินค้า (SKU)
              <input name="sku" defaultValue={p?.sku} required />
            </label>
            <label className="field">
              บาร์โค้ด
              <input name="barcode" defaultValue={p?.barcode ?? ""} />
            </label>
          </div>
          <div className="grid2">
            <label className="field">
              ราคาขาย
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={p?.price ?? 0}
                required
              />
            </label>
            <label className="field">
              หมวดหมู่
              <select name="categoryId" defaultValue={p?.categoryId}>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid2">
            <label className="field">
              การตัดสต็อก
              <select
                name="trackStockType"
                defaultValue={p?.trackStockType ?? "DIRECT_UNIT"}
              >
                <option value="DIRECT_UNIT">นับเป็นชิ้น</option>
                <option value="RECIPE">ตามสูตร BOM</option>
                <option value="NONE">ไม่ตัดสต็อก</option>
              </select>
            </label>
            <label className="field">
              จำนวนคงเหลือ (รายชิ้น)
              <input
                name="directStockQty"
                type="number"
                min="0"
                defaultValue={p?.directStockQty ?? 0}
              />
            </label>
          </div>
          <label className="check">
            <input
              name="isAvailable"
              type="checkbox"
              defaultChecked={p?.isAvailable ?? true}
            />
            เปิดขายสินค้า
          </label>
          <label className="field">
            เหตุผลปรับยอดสต็อก
            <input
              name="stockReason"
              defaultValue={p ? "ตรวจนับสินค้า" : "ยอดตั้งต้นสินค้า"}
              minLength={3}
              maxLength={300}
              required
            />
            <small>บันทึกเฉพาะสาขา {data.branch.name}</small>
          </label>
        </FormModal>
      )}
      {category && (
        <FormModal
          title="เพิ่มหมวดหมู่"
          onClose={() => setCategory(false)}
          onSubmit={async (f) => {
            await action("categories", {
              name: fString(f, "name"),
              kitchenStation: fString(f, "station"),
            });
            notify("เพิ่มหมวดหมู่แล้ว");
          }}
        >
          <label className="field">
            ชื่อหมวดหมู่
            <input name="name" required />
          </label>
          <label className="field">
            สถานีครัว
            <select name="station">
              <option value="MAIN">ครัวร้อน</option>
              <option value="BAR">บาร์น้ำ</option>
              <option value="BAKERY">เบเกอรี่</option>
            </select>
          </label>
        </FormModal>
      )}
      {modifier && (
        <ModifierEditor product={modifier} onClose={() => setModifier(null)} />
      )}
    </>
  );
}
function ModifierEditor({
  product,
  onClose,
}: {
  product: ProductView;
  onClose: () => void;
}) {
  const { action, notify } = useStore();
  return (
    <FormModal
      title={`ตัวเลือก · ${product.name}`}
      onClose={onClose}
      onSubmit={async (f) => {
        const rows = fString(f, "options")
          .split("\n")
          .filter(Boolean)
          .map((s) => {
            const [name, price] = s.split("|");
            return { name: name.trim(), priceDelta: Number(price ?? 0) };
          });
        await action("modifiers", {
          productId: product.id,
          name: fString(f, "name"),
          isRequired: f.get("required") === "on",
          maxSelect: fNumber(f, "max"),
          options: rows,
        });
        notify("เพิ่มกลุ่มตัวเลือกแล้ว");
      }}
    >
      {product.modifierGroups.map(({ modifierGroup: g }) => (
        <div className="notice" key={g.id}>
          <strong>{g.name}</strong>
          <p>
            {g.options
              .map(
                (o) =>
                  `${o.name}${Number(o.priceDelta) ? ` +${o.priceDelta}` : ""}`,
              )
              .join(" · ")}
          </p>
        </div>
      ))}
      <h3>เพิ่มกลุ่มตัวเลือก</h3>
      <label className="field">
        ชื่อกลุ่ม
        <input name="name" placeholder="เช่น เลือกชนิดนม" required />
      </label>
      <label className="field">
        ตัวเลือก (หนึ่งบรรทัดต่อรายการ)
        <textarea name="options" placeholder={"นมสด|0\nนมโอ๊ต|20"} required />
        <small>รูปแบบ: ชื่อตัวเลือก|ราคาเพิ่ม</small>
      </label>
      <label className="field">
        เลือกได้สูงสุด
        <input name="max" type="number" defaultValue={1} min={1} max={10} />
      </label>
      <label className="check">
        <input type="checkbox" name="required" />
        บังคับเลือก
      </label>
    </FormModal>
  );
}
