"use client";
import { useState, useEffect } from "react";
import { Bell, ReceiptText, Plus, Minus } from "lucide-react";
import { api } from "@/lib/client-api";
import type { ProductView, CartLine } from "@/lib/view-types";
import { totals, money } from "@/lib/money";
import { ProductImage } from "./product-image";
import { ModifierPicker } from "./pos/modifier-picker";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
type Menu = {
  name: string;
  table: { id: string; name: string };
  branch: { vatRate: string; vatInclusive: boolean; serviceChargeRate: string };
  products: ProductView[];
};
export function MobileMenu({ token }: { token: string }) {
  const [data, setData] = useState<Menu | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [category, setCategory] = useState("all"),
    [product, setProduct] = useState<ProductView | null>(null),
    [lines, setLines] = useState<CartLine[]>([]),
    [cart, setCart] = useState(false),
    [busy, setBusy] = useState(false),
    [orderId, setOrderId] = useState("");
  useEffect(() => {
    void api<Menu>(`/api/m/${token}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);
  const add = (line: CartLine) => {
    setLines((s) =>
      s.some((l) => l.key === line.key)
        ? s.map((l) =>
            l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...s, line],
    );
    setMessage("เพิ่ม " + line.name + " แล้ว");
  };
  const total = data
    ? totals(
        lines.reduce((s, l) => s + l.price * l.quantity, 0),
        0,
        Number(data.branch.vatRate),
        data.branch.vatInclusive,
        Number(data.branch.serviceChargeRate),
      ).grandTotal
    : 0;
  const call = async (action: string) => {
    try {
      await api(`/api/m/${token}`, { action });
      setMessage(action === "bill" ? "แจ้งขอเช็กบิลแล้ว" : "แจ้งพนักงานแล้ว");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="mobile-order">
      <header>
        <span className="brand">
          BUZLIKE <b>POS</b>
        </span>
        <h1 className="section-space">{data?.name ?? "เมนูร้านค้า"}</h1>
        {data && (
          <p className="muted">
            โต๊ะ {data.table.name} · เลือกเมนูแล้วส่งเข้าครัวได้เลย
          </p>
        )}
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {data && (
        <>
          <div className="row section-space">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void call("call")}
            >
              <Bell size={16} />
              เรียกพนักงาน
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void call("bill")}
            >
              <ReceiptText size={16} />
              ขอเช็กบิล
            </Button>
          </div>
          <div className="tabs section-space" style={{ marginBottom: 20 }}>
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
            >
              ทั้งหมด
            </button>
            {[
              ...new Map(
                data.products.map((p) => [p.categoryId, p.category.name]),
              ).entries(),
            ].map(([id, name]) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                onClick={() => setCategory(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {data.products
              .filter((p) => category === "all" || p.categoryId === category)
              .map((p) => (
                <button
                  key={p.id}
                  className="product-card"
                  onClick={() =>
                    p.modifierGroups.length
                      ? setProduct(p)
                      : add({
                          key: p.id,
                          productId: p.id,
                          name: p.name,
                          price: Number(p.price),
                          quantity: 1,
                          optionIds: [],
                          optionNames: [],
                          note: "",
                          imageUrl: p.imageUrl,
                        })
                  }
                >
                  <ProductImage image={p.imageUrl} name={p.name} />
                  <div className="product-info">
                    <strong>{p.name}</strong>
                    <span>฿{money(p.price).replace(".00", "")}</span>
                  </div>
                </button>
              ))}
          </div>
          <div className="sticky-bottom">
            <Button
              disabled={!lines.length}
              onClick={() => {
                setError("");
                setCart(true);
                setOrderId(crypto.randomUUID());
              }}
            >
              ดูรายการ {lines.reduce((s, l) => s + l.quantity, 0)} ชิ้น · ฿
              {money(total)}
            </Button>
          </div>
          <ModifierPicker
            key={product?.id ?? "none"}
            product={product}
            onClose={() => setProduct(null)}
            onAdd={add}
          />
          <Modal
            title={`รายการสั่ง · ${data.table.name}`}
            open={cart}
            onClose={() => !busy && setCart(false)}
          >
            <div className="stack">
              {lines.map((l) => (
                <div className="row between" key={l.key}>
                  <div>
                    <strong>{l.name}</strong>
                    <small style={{ display: "block" }}>
                      {l.optionNames.join(" · ")}
                    </small>
                  </div>
                  <div className="qty">
                    <button
                      aria-label={`ลด ${l.name}`}
                      onClick={() =>
                        setLines((s) =>
                          s
                            .map((x) =>
                              x.key === l.key
                                ? { ...x, quantity: x.quantity - 1 }
                                : x,
                            )
                            .filter((x) => x.quantity > 0),
                        )
                      }
                    >
                      <Minus />
                    </button>
                    {l.quantity}
                    <button
                      aria-label={`เพิ่ม ${l.name}`}
                      onClick={() =>
                        setLines((s) =>
                          s.map((x) =>
                            x.key === l.key
                              ? { ...x, quantity: x.quantity + 1 }
                              : x,
                          ),
                        )
                      }
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
              ))}
              <div className="row between">
                <h3>รวมสุทธิ</h3>
                <h2>฿{money(total)}</h2>
              </div>
              {error && <p className="error">{error}</p>}
              <Button
                disabled={busy || !lines.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await api<{ queueNumber: number }>(
                      `/api/m/${token}`,
                      {
                        clientOrderId: orderId,
                        items: lines.map((l) => ({
                          productId: l.productId,
                          quantity: l.quantity,
                          optionIds: l.optionIds,
                          note: l.note,
                        })),
                      },
                    );
                    setLines([]);
                    setCart(false);
                    setMessage(`ส่งเข้าครัวแล้ว · คิว #${result.queueNumber}`);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "กำลังส่ง…" : "ส่งออเดอร์เข้าครัว"}
              </Button>
            </div>
          </Modal>
        </>
      )}
    </main>
  );
}
