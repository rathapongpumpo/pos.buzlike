"use client";
import { useEffect, useState, useRef } from "react";
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  Pause,
  Trash2,
  Printer,
  Monitor,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import { useStore } from "../store-context";
import { ProductImage } from "../product-image";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import { ModifierPicker } from "./modifier-picker";
import { Payment, type PaymentValues } from "./payment";
import { ThermalReceipt } from "./receipt";
import { totals, money } from "@/lib/money";
import { offline } from "@/lib/offline-queue";
import { saleAccessBlocked } from "@/lib/pilot-access";
import type { ProductView, OrderView, CartLine } from "@/lib/view-types";
import type { OrderInput } from "@/lib/orders";
export function PosTerminal() {
  const { data, slug, namespace, terminalKey, online, action, notify } =
    useStore();
  const { lines, add, quantity, clear, restore } = useCart();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [product, setProduct] = useState<ProductView | null>(null),
    [type, setType] = useState<"DINE_IN" | "TAKEAWAY" | "DELIVERY">("TAKEAWAY"),
    [tableId, setTableId] = useState(""),
    [discount, setDiscount] = useState("0"),
    [percent, setPercent] = useState(false),
    [discountReason, setDiscountReason] = useState(""),
    [payment, setPayment] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [shiftModal, setShiftModal] = useState(false),
    [held, setHeld] = useState<
      { id: string; key: string; lines: CartLine[]; createdAt: string }[] | null
    >(null),
    [legacyHeldAccepted, setLegacyHeldAccepted] = useState<string | null>(null),
    [receipt, setReceipt] = useState<OrderView | null>(null),
    [width, setWidth] = useState("80");
  const idRef = useRef("");
  const currentShift = data.shifts.find((s) => s.status === "OPEN");
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const off = percent ? (subtotal * Number(discount)) / 100 : Number(discount);
  const calculated = totals(
    subtotal,
    off,
    Number(data.branch.vatRate),
    data.branch.vatInclusive,
    Number(data.branch.serviceChargeRate),
  );
  const select = (p: ProductView) => {
    if (p.modifierGroups.length) setProduct(p);
    else
      add({
        key: p.id,
        productId: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: 1,
        optionIds: [],
        optionNames: [],
        note: "",
        imageUrl: p.imageUrl,
      });
  };
  useEffect(() => {
    let buffer = "",
      last = 0;
    const handler = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) ||
        payment ||
        product
      )
        return;
      const now = Date.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter" && buffer.length >= 4) {
        const found = data.products.find((p) => p.barcode === buffer);
        if (found) select(found);
        else notify("ไม่พบสินค้าบาร์โค้ด " + buffer);
        buffer = "";
      } else if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data.products, payment, product, notify]);
  useEffect(() => {
    clear();
    return () => clear();
  }, [namespace, clear]);
  const filtered = data.products.filter(
    (p) =>
      p.isAvailable &&
      (category === "all" || p.categoryId === category) &&
      `${p.name} ${p.sku} ${p.barcode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function pay(values: PaymentValues) {
    if (busy) return;
    if (saleAccessBlocked(data)) {
      setError(
        "สิทธิ์ใช้งานหมดอายุหรือถูกระงับ บิลค้างยังอยู่ในเครื่องให้ตรวจสอบ",
      );
      return;
    }
    setBusy(true);
    setError("");
    const clientOrderId =
      idRef.current || (idRef.current = crypto.randomUUID());
    let terminalId = localStorage.getItem("buzlike-terminal:" + terminalKey);
    if (!terminalId) {
      terminalId = crypto.randomUUID();
      localStorage.setItem("buzlike-terminal:" + terminalKey, terminalId);
    }
    const input: OrderInput = {
      clientOrderId,
      terminalId,
      expectedGrandTotal: calculated.grandTotal,
      branchId: data.branch.id,
      operatorId: data.staff.id,
      shiftId: currentShift?.id,
      tableId: type === "DINE_IN" && tableId ? tableId : null,
      orderType: type,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        optionIds: l.optionIds,
        note: l.note,
      })),
      discount: off,
      discountReason,
      customerNote: "",
      ...values,
    };
    try {
      let result: OrderView;
      let connectionFailed = !navigator.onLine;
      // Keep a durable pending copy before the first network attempt. A lost response
      // is safe to retry because the server checks the same clientOrderId and hash.
      if (values.method === "CASH")
        await offline.queue.put({
          id: clientOrderId,
          key: namespace,
          slug,
          input,
          status: "pending",
        });
      if (!connectionFailed) {
        try {
          result = await action<OrderView>("orders", input);
          await offline.queue.delete(clientOrderId);
        } catch (e) {
          if (e instanceof TypeError || !navigator.onLine)
            connectionFailed = true;
          else {
            if (values.method === "CASH")
              await offline.queue.update(clientOrderId, {
                status: "conflict",
                error: (e as Error).message,
              });
            throw e;
          }
        }
      }
      if (connectionFailed) {
        if (values.method !== "CASH")
          throw new Error("ออฟไลน์รองรับเงินสดเท่านั้น");
        await offline.queue.put({
          id: clientOrderId,
          key: namespace,
          slug,
          input,
          status: "pending",
        });
        result = {
          id: clientOrderId,
          orderNumber: `OFFLINE-${clientOrderId.slice(0, 8)}`,
          queueNumber: 0,
          createdAt: new Date().toISOString(),
          orderType: type,
          status: "PAID",
          ...calculated,
          items: lines.map((l, i) => ({
            id: String(i),
            productNameSnapshot: l.name,
            unitPriceSnapshot: String(l.price),
            quantity: l.quantity,
            lineTotal: String(l.price * l.quantity),
            modifiers: l.optionNames.map((n) => ({
              optionName: n,
              priceDelta: "0",
            })),
            note: l.note,
          })),
          table: data.tables.find((t) => t.id === tableId) ?? null,
          staff: { displayName: data.staff.displayName },
          payments: values.payments ?? [
            {
              method: values.method,
              amount: String(calculated.grandTotal),
              cashReceived: String(values.cashReceived),
              changeGiven: String(
                (values.cashReceived ?? calculated.grandTotal) -
                  calculated.grandTotal,
              ),
            },
          ],
        } as unknown as OrderView;
        notify("บันทึกบิลในเครื่องแล้ว รอซิงก์เมื่อออนไลน์");
      }
      setReceipt(result!);
      clear();
      setDiscount("0");
      setDiscountReason("");
      setPayment(false);
      setTableId("");
      idRef.current = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="pos-layout">
        <section className="catalog">
          <div className="catalog-title row between">
            <h1>ขายหน้าร้าน</h1>
            <div className="row">
              <Link
                href={`/${slug}/cfd?branchId=${data.branch.id}`}
                target="_blank"
                className="icon-button"
                title="จอลูกค้า"
              >
                <Monitor size={20} />
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShiftModal(true)}
              >
                <Wallet size={16} />
                {currentShift ? "กะเปิดอยู่" : "เปิดกะ"}
              </Button>
            </div>
          </div>
          <div className="search">
            <Search size={22} />
            <input
              aria-label="ค้นหาสินค้าหรือสแกนบาร์โค้ด"
              placeholder="ค้นหาสินค้าหรือสแกนบาร์โค้ด"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const p = data.products.find((p) => p.barcode === search);
                  if (p) {
                    select(p);
                    setSearch("");
                  }
                }
              }}
            />
            <ScanBarcode size={22} />
          </div>
          <div className="tabs">
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
            >
              ทั้งหมด
            </button>
            {data.categories.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? "active" : ""}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {filtered.map((p) => (
              <button
                className="product-card"
                key={p.id}
                onClick={() => select(p)}
                aria-label={`${p.name} ${Number(p.price)} บาท`}
              >
                <ProductImage image={p.imageUrl} name={p.name} />
                <div className="product-info">
                  <strong>{p.name}</strong>
                  <span>฿{money(p.price).replace(".00", "")}</span>
                </div>
              </button>
            ))}
          </div>
          {!filtered.length && <div className="empty">ไม่พบสินค้า</div>}
        </section>
        <aside className="cart">
          <div className="cart-heading row between">
            <h2>รายการขาย</h2>
            <span className="muted">
              {lines.reduce((s, l) => s + l.quantity, 0)} รายการ
            </span>
          </div>
          <div className="tabs cart-types">
            {[
              ["DINE_IN", "ทานที่ร้าน"],
              ["TAKEAWAY", "กลับบ้าน"],
              ["DELIVERY", "เดลิเวอรี่"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={type === key ? "active" : ""}
                onClick={() => setType(key as typeof type)}
              >
                {label}
              </button>
            ))}
          </div>
          {type === "DINE_IN" && (
            <label className="field cart-table">
              โต๊ะ
              <select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
              >
                <option value="">ไม่ระบุโต๊ะ</option>
                {data.tables
                  .filter((t) => t.status !== "AVAILABLE")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="cart-items">
            {!lines.length ? (
              <div className="cart-empty">
                <ShoppingCart size={38} />
                <strong>เริ่มจากเลือกสินค้า</strong>
                <span>รายการที่เลือกจะแสดงที่นี่</span>
              </div>
            ) : (
              lines.map((l) => (
                <div className="cart-line" key={l.key}>
                  <div className="cart-thumb">
                    <ProductImage image={l.imageUrl} name={l.name} />
                  </div>
                  <div className="cart-name">
                    <strong>{l.name}</strong>
                    <small>{l.optionNames.join(" · ")}</small>
                    {l.note && <small>{l.note}</small>}
                    <small>฿{money(l.price)}</small>
                  </div>
                  <div className="qty">
                    <button
                      aria-label={`ลด ${l.name}`}
                      onClick={() => quantity(l.key, -1)}
                    >
                      <Minus />
                    </button>
                    <span>{l.quantity}</span>
                    <button
                      aria-label={`เพิ่ม ${l.name}`}
                      onClick={() => quantity(l.key, 1)}
                    >
                      <Plus />
                    </button>
                  </div>
                  <strong className="price">
                    ฿{money(l.price * l.quantity).replace(".00", "")}
                  </strong>
                </div>
              ))
            )}
          </div>
          <div className="cart-summary">
            <div>
              <span>ยอดรวมสินค้า</span>
              <span>฿{money(subtotal)}</span>
            </div>
            <div>
              <span>
                ส่วนลด{" "}
                {["OWNER", "MANAGER"].includes(data.staff.role) && (
                  <button
                    className="ghost"
                    style={{ border: 0, fontSize: 12 }}
                    onClick={() => setPercent(!percent)}
                  >
                    {percent ? "%" : "บาท"}
                  </button>
                )}
              </span>
              <span>
                −{" "}
                <input
                  className="discount-input"
                  aria-label="ส่วนลด"
                  type="number"
                  min="0"
                  max={percent ? 100 : subtotal}
                  disabled={!["OWNER", "MANAGER"].includes(data.staff.role)}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </span>
            </div>
            {off > 0 && (
              <input
                className="input"
                placeholder="เหตุผลส่วนลด"
                aria-label="เหตุผลส่วนลด"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                maxLength={200}
              />
            )}
            <div>
              <span>
                ภาษีมูลค่าเพิ่ม ({Number(data.branch.vatRate)}%
                {data.branch.vatInclusive ? " รวมแล้ว" : ""})
              </span>
              <span>฿{money(calculated.vatAmount)}</span>
            </div>
            {calculated.serviceChargeAmount > 0 && (
              <div>
                <span>ค่าบริการ</span>
                <span>฿{money(calculated.serviceChargeAmount)}</span>
              </div>
            )}
            <div className="grand-total">
              <span>รวมสุทธิ</span>
              <span>฿{money(calculated.grandTotal)}</span>
            </div>
          </div>
          <Button
            className="checkout-button"
            disabled={
              !lines.length ||
              saleAccessBlocked(data) ||
              off > subtotal ||
              Number(discount) < 0
            }
            onClick={() => {
              setError("");
              if (!currentShift) setShiftModal(true);
              else {
                setPayment(true);
                idRef.current = crypto.randomUUID();
              }
            }}
          >
            <CreditCard size={25} /> ชำระเงิน
          </Button>
          <div className="cart-actions">
            <Button
              variant="ghost"
              size="sm"
              disabled={!lines.length}
              onClick={async () => {
                await offline.held.put({
                  id: crypto.randomUUID(),
                  key: namespace,
                  lines,
                  createdAt: new Date().toISOString(),
                });
                clear();
                notify("พักบิลแล้ว");
              }}
            >
              <Pause size={15} />
              พักบิล
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () =>
                setHeld(
                  await offline.held
                    .where("key")
                    .anyOf([
                      namespace,
                      ...(["OWNER", "MANAGER"].includes(data.staff.role)
                        ? [terminalKey]
                        : []),
                    ])
                    .toArray(),
                )
              }
            >
              เรียกบิลพัก
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!lines.length}
              onClick={clear}
              aria-label="ล้างตะกร้า"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </aside>
      </div>
      <ModifierPicker
        key={product?.id ?? "none"}
        product={product}
        onClose={() => setProduct(null)}
        onAdd={add}
      />
      {payment && (
        <Payment
          total={calculated.grandTotal}
          lines={lines}
          onClose={() => setPayment(false)}
          onConfirm={(v) => void pay(v)}
          busy={busy}
          error={error}
        />
      )}
      <Modal
        title={currentShift ? "กะขายปัจจุบัน" : "เปิดกะแคชเชียร์"}
        open={shiftModal}
        onClose={() => setShiftModal(false)}
      >
        {currentShift ? (
          <div className="stack">
            <p>
              เปิดกะเมื่อ{" "}
              {new Date(currentShift.openedAt).toLocaleString("th-TH")}
            </p>
            <p>เงินทอนตั้งต้น ฿{money(currentShift.startingCash)}</p>
            <Button asChild>
              <Link href={`/${slug}/shifts?branchId=${data.branch.id}`}>
                จัดการเงินสด / ปิดกะ
              </Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await action("shifts/open", {
                  startingCash: Number(f.get("cash")),
                });
                setShiftModal(false);
                notify("เปิดกะเรียบร้อยแล้ว");
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <label className="field">
              เงินทอนตั้งต้น
              <input
                name="cash"
                type="number"
                min="0"
                step="0.01"
                defaultValue="1000"
                required
              />
            </label>
            <Button type="submit">เปิดกะและเริ่มขาย</Button>
          </form>
        )}
      </Modal>
      <Modal
        title="บิลที่พักไว้"
        open={held !== null}
        onClose={() => setHeld(null)}
      >
        <div className="stack">
          {held?.length ? (
            held.map((h) => (
              <div className="stack panel" key={h.id}>
                <div>
                  <strong>
                    {h.lines.length} รายการ · ฿
                    {money(
                      h.lines.reduce((s, l) => s + l.price * l.quantity, 0),
                    )}
                  </strong>
                  <small style={{ display: "block" }}>
                    {new Date(h.createdAt).toLocaleTimeString("th-TH")}
                  </small>
                </div>
                {h.key === terminalKey && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={legacyHeldAccepted === h.id}
                      onChange={(event) =>
                        setLegacyHeldAccepted(
                          event.target.checked ? h.id : null,
                        )
                      }
                    />
                    บิลพักรุ่นเดิม: ยืนยันใช้สาขา {data.branch.name}{" "}
                    และราคาปัจจุบัน
                  </label>
                )}
                <Button
                  variant="outline"
                  disabled={
                    h.key === terminalKey && legacyHeldAccepted !== h.id
                  }
                  onClick={async () => {
                    if (lines.length) {
                      notify("กรุณาพักหรือล้างบิลปัจจุบันก่อน");
                      return;
                    }
                    try {
                      const updated = h.lines.map((line) => {
                        const product = data.products.find(
                          (product) =>
                            product.id === line.productId &&
                            product.isAvailable,
                        );
                        if (!product)
                          throw new Error(
                            `สินค้า ${line.name} ไม่เปิดขายในสาขานี้`,
                          );
                        const choices = product.modifierGroups
                          .flatMap((join) => join.modifierGroup.options)
                          .filter((option) =>
                            line.optionIds.includes(option.id),
                          );
                        return {
                          ...line,
                          name: product.name,
                          price:
                            Number(product.price) +
                            choices.reduce(
                              (sum, option) => sum + Number(option.priceDelta),
                              0,
                            ),
                        };
                      });
                      restore(updated);
                      await offline.held.delete(h.id);
                      setHeld(null);
                    } catch (error) {
                      notify((error as Error).message);
                    }
                  }}
                >
                  เรียกบิล
                </Button>
              </div>
            ))
          ) : (
            <p className="empty">ไม่มีบิลพัก</p>
          )}
        </div>
      </Modal>
      <Modal
        title={
          receipt?.orderNumber.startsWith("OFFLINE-")
            ? "บันทึกในเครื่อง · รอซิงก์"
            : "บันทึกการขายสำเร็จ"
        }
        open={!!receipt}
        onClose={() => setReceipt(null)}
      >
        {receipt && (
          <>
            <div className="row between no-print" style={{ marginBottom: 20 }}>
              <label className="field">
                กระดาษ
                <select
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                >
                  <option value="80">80 มม.</option>
                  <option value="58">58 มม.</option>
                </select>
              </label>
              <Button onClick={() => window.print()}>
                <Printer size={17} />
                พิมพ์ใบเสร็จ
              </Button>
            </div>
            <ThermalReceipt
              order={receipt}
              branch={data.branch}
              storeName={data.tenant.name}
              width={width}
            />
          </>
        )}
      </Modal>
    </>
  );
}
