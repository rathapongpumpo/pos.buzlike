import type { Bootstrap, OrderView } from "@/lib/view-types";
import { money } from "@/lib/money";
export function ThermalReceipt({
  order,
  branch,
  storeName,
  width = "80",
}: {
  order: OrderView;
  branch: Bootstrap["branch"];
  storeName: string;
  width?: string;
}) {
  return (
    <div className={`receipt ${width === "58" ? "receipt-58" : ""}`}>
      <h2>{storeName}</h2>
      {order.orderNumber.startsWith("OFFLINE-") && (
        <p className="center">
          <strong>ใบรับเงินชั่วคราว · รอซิงก์</strong>
        </p>
      )}
      <div className="center">
        {branch.name}
        <br />
        {branch.address}
        {branch.taxId && (
          <>
            <br />
            เลขผู้เสียภาษี {branch.taxId}
          </>
        )}
        <br />
        {branch.receiptHeader}
      </div>
      <div className="queue">
        {order.orderNumber.startsWith("OFFLINE-")
          ? "บิลออฟไลน์"
          : `#${String(order.queueNumber).padStart(3, "0")}`}
      </div>
      <div className="center">
        {order.orderNumber}
        <br />
        {new Date(order.createdAt).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        })}
        <br />
        {order.table?.name ??
          {
            DINE_IN: "ทานที่ร้าน",
            TAKEAWAY: "กลับบ้าน",
            DELIVERY: "เดลิเวอรี่",
          }[order.orderType]}{" "}
        · {order.staff?.displayName}
      </div>
      <hr />
      {order.items.map((i) => (
        <div key={i.id}>
          <div className="receipt-line">
            <span>
              {i.quantity} × {i.productNameSnapshot}
            </span>
            <span>{money(i.lineTotal)}</span>
          </div>
          {i.modifiers.map((m, j) => (
            <div style={{ fontSize: 11, paddingLeft: 12 }} key={j}>
              {m.optionName}{" "}
              {Number(m.priceDelta) > 0 ? `+${money(m.priceDelta)}` : ""}
            </div>
          ))}
          {i.note && <div style={{ paddingLeft: 12 }}>• {i.note}</div>}
        </div>
      ))}
      <hr />
      <div className="receipt-line">
        <span>ยอดรวมสินค้า</span>
        <span>{money(order.subtotal)}</span>
      </div>
      <div className="receipt-line">
        <span>ส่วนลด</span>
        <span>{money(order.discountAmount)}</span>
      </div>
      {Number(order.serviceChargeAmount) > 0 && (
        <div className="receipt-line">
          <span>ค่าบริการ</span>
          <span>{money(order.serviceChargeAmount)}</span>
        </div>
      )}
      <div className="receipt-line">
        <span>ยอดก่อน VAT</span>
        <span>{money(Number(order.grandTotal) - Number(order.vatAmount))}</span>
      </div>
      <div className="receipt-line">
        <span>VAT {Number(branch.vatRate)}%</span>
        <span>{money(order.vatAmount)}</span>
      </div>
      <hr />
      <div className="receipt-line" style={{ fontSize: 16, fontWeight: 700 }}>
        <span>รวมสุทธิ</span>
        <span>{money(order.grandTotal)}</span>
      </div>
      {order.payments.map((p, i) => (
        <div key={i}>
          <div className="receipt-line">
            <span>{p.method === "CASH" ? "เงินสด" : p.method}</span>
            <span>{money(p.amount)}</span>
          </div>
          {p.method === "CASH" && (
            <>
              <div className="receipt-line">
                <span>รับเงิน</span>
                <span>{money(p.cashReceived)}</span>
              </div>
              <div className="receipt-line">
                <span>เงินทอน</span>
                <span>{money(p.changeGiven)}</span>
              </div>
            </>
          )}
        </div>
      ))}
      <hr />
      <div className="center">
        {branch.receiptFooter || "ขอบคุณที่ใช้บริการ"}
        <br />
        BUZLIKE POS
      </div>
    </div>
  );
}
