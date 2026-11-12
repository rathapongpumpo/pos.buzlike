"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../store-context";
import { money } from "@/lib/money";
export function CustomerDisplay() {
  const { data, terminalKey } = useStore();
  const [display, setDisplay] = useState<{
    total: number;
    lines: { name: string; quantity: number; price: number }[];
    payload: string;
    account: string;
  }>({ total: 0, lines: [], payload: "", account: "" });
  useEffect(() => {
    const channel = new BroadcastChannel(
      `buzlike-cfd:${terminalKey}:${data.branch.id}`,
    );
    channel.onmessage = (e) => setDisplay(e.data);
    return () => channel.close();
  }, [terminalKey, data.branch.id]);
  return (
    <main className="cfd">
      <div className="row between">
        <h1>{data.tenant.name}</h1>
        <span className="brand">
          BUZLIKE <b>POS</b>
        </span>
      </div>
      {display.total ? (
        <>
          <div className="payment-total">฿{money(display.total)}</div>
          {display.lines?.map((l, i) => (
            <div className="row between heading-row" key={i}>
              <span>
                {l.quantity} × {l.name}
              </span>
              <strong>฿{money(l.quantity * l.price)}</strong>
            </div>
          ))}
          {display.payload && (
            <>
              <div className="qr-code">
                <QRCodeSVG value={display.payload} size={280} />
              </div>
              <p style={{ textAlign: "center" }}>{display.account}</p>
            </>
          )}
        </>
      ) : (
        <div className="empty">
          <h2>ยินดีต้อนรับ</h2>
          <p>รายการและยอดชำระจะแสดงที่นี่</p>
        </div>
      )}
      <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
        {data.branch.receiptFooter}
      </p>
    </main>
  );
}
