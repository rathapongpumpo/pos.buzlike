"use client";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Banknote, QrCode, CreditCard } from "lucide-react";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { money, cents } from "@/lib/money";
import { useStore } from "../store-context";
import { promptpay } from "@/lib/promptpay";
export type PaymentValues = {
  method: "CASH" | "PROMPTPAY_QR" | "CREDIT_CARD" | "TRANSFER";
  cashReceived?: number;
  referenceNo?: string;
  payments?: {
    method: "CASH" | "PROMPTPAY_QR" | "CREDIT_CARD" | "TRANSFER";
    amount: number;
    cashReceived?: number;
    referenceNo?: string;
  }[];
};
export function Payment({
  total,
  onClose,
  onConfirm,
  busy,
  error,
  lines,
}: {
  total: number;
  onClose: () => void;
  onConfirm: (values: PaymentValues) => void;
  busy: boolean;
  error: string;
  lines?: { name: string; quantity: number; price: number }[];
}) {
  const { data, terminalKey } = useStore();
  const [method, setMethod] = useState<PaymentValues["method"]>("CASH"),
    [cash, setCash] = useState(String(total)),
    [ref, setRef] = useState(""),
    [split, setSplit] = useState(1),
    [splitMode, setSplitMode] = useState("equal"),
    [assignments, setAssignments] = useState<Record<number, number>>({});
  let payload = "";
  try {
    if (method === "PROMPTPAY_QR")
      payload = promptpay(data.branch.promptPayId, total);
  } catch {}
  useEffect(() => {
    const channel = new BroadcastChannel(
      `buzlike-cfd:${terminalKey}:${data.branch.id}`,
    );
    channel.postMessage({
      total,
      lines,
      payload,
      storeName: data.tenant.name,
      account: data.branch.promptPayName,
    });
    return () => {
      channel.postMessage({ total: 0, lines: [], payload: "" });
      channel.close();
    };
  }, [
    total,
    lines,
    payload,
    data.branch.id,
    data.tenant.name,
    data.branch.promptPayName,
    terminalKey,
  ]);
  const valid =
    method === "CASH"
      ? Number(cash) >= total
      : ref.trim().length > 0 && (method !== "PROMPTPAY_QR" || !!payload);
  return (
    <Modal title="รับชำระเงิน" open onClose={() => !busy && onClose()}>
      <div className="payment-total">฿{money(total)}</div>
      <div className="tabs">
        <button
          className={method === "CASH" ? "active" : ""}
          onClick={() => setMethod("CASH")}
        >
          <Banknote size={17} /> เงินสด
        </button>
        <button
          className={method === "PROMPTPAY_QR" ? "active" : ""}
          onClick={() => setMethod("PROMPTPAY_QR")}
        >
          <QrCode size={17} /> พร้อมเพย์
        </button>
        <button
          className={method === "CREDIT_CARD" ? "active" : ""}
          onClick={() => setMethod("CREDIT_CARD")}
        >
          <CreditCard size={17} /> บัตร
        </button>
      </div>
      <div className="section-space stack">
        {method === "CASH" ? (
          <>
            <label className="field">
              เงินที่รับมา
              <input
                type="number"
                min={total}
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                autoFocus
              />
            </label>
            <div className="cash-shortcuts">
              {[total, 20, 50, 100, 500, 1000].map((n, i) => (
                <Button
                  key={i}
                  variant="outline"
                  disabled={n < total}
                  onClick={() => setCash(String(n))}
                >
                  {i === 0 ? "พอดี" : `฿${money(n).replace(".00", "")}`}
                </Button>
              ))}
            </div>
            <div className="change-box">
              <span>เงินทอน</span>
              <strong>฿{money(Math.max(0, Number(cash) - total))}</strong>
            </div>
          </>
        ) : (
          <>
            {method === "PROMPTPAY_QR" ? (
              payload ? (
                <>
                  <div className="qr-code">
                    <QRCodeSVG value={payload} size={220} level="M" />
                  </div>
                  <p className="muted" style={{ textAlign: "center" }}>
                    {data.branch.promptPayName || "บัญชีร้านค้า"} ·{" "}
                    {data.branch.promptPayId}
                  </p>
                </>
              ) : (
                <p className="error">
                  กรุณาตั้งค่าเลขพร้อมเพย์ในหน้าตั้งค่าก่อน
                </p>
              )
            ) : (
              <p className="notice">
                รับชำระผ่านเครื่องรูดบัตรของร้าน แล้วบันทึกเลขอ้างอิง
              </p>
            )}
            <label className="field">
              เลขอ้างอิงการชำระเงิน
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="ตรวจสอบยอดเงินเข้าก่อนยืนยัน"
                maxLength={100}
              />
            </label>
            <small>QR หน้าร้านไม่มีการตรวจยอดเงินเข้าอัตโนมัติ</small>
          </>
        )}
        <label className="field">
          จำนวนผู้ชำระ
          <select
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option value={n} key={n}>
                {n === 1
                  ? "ชำระเต็มจำนวน"
                  : `${n} คน · คนละประมาณ ฿${money(total / n)}`}
              </option>
            ))}
          </select>
        </label>
        {split > 1 && lines?.length && (
          <>
            <label className="field">
              วิธีแบ่งจ่าย
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value)}
              >
                <option value="equal">หารเท่ากัน</option>
                <option value="items">แบ่งตามรายการ</option>
              </select>
            </label>
            {splitMode === "items" &&
              lines.map((line, i) => (
                <label className="field" key={i}>
                  {line.quantity} × {line.name}
                  <select
                    value={assignments[i] ?? 0}
                    onChange={(e) =>
                      setAssignments((s) => ({
                        ...s,
                        [i]: Number(e.target.value),
                      }))
                    }
                  >
                    {Array.from({ length: split }, (_, j) => (
                      <option key={j} value={j}>
                        ผู้ชำระ {j + 1}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Button
          className="full"
          disabled={!valid || busy}
          onClick={() => {
            const base = {
              method,
              cashReceived: method === "CASH" ? Number(cash) : undefined,
              referenceNo: ref || undefined,
            };
            if (split > 1) {
              const sum = cents(total);
              const each = Math.floor(sum / split);
              let amounts = Array.from({ length: split }, (_, i) =>
                i === split - 1 ? sum - each * (split - 1) : each,
              );
              if (splitMode === "items" && lines?.length) {
                const weights = Array.from({ length: split }, () => 0);
                for (const [i, line] of lines.entries())
                  weights[Math.min(assignments[i] ?? 0, split - 1)] +=
                    line.price * line.quantity;
                const all = weights.reduce((s, n) => s + n, 0);
                if (all > 0) {
                  let allocated = 0;
                  const last = weights.findLastIndex((w) => w > 0);
                  amounts = weights.map((w, i) => {
                    const value =
                      i === last
                        ? sum - allocated
                        : Math.floor((sum * w) / all);
                    allocated += value;
                    return value;
                  });
                }
              }
              amounts = amounts.filter((n) => n > 0);
              onConfirm({
                ...base,
                payments: amounts.map((value, i) => {
                  const amount = value / 100;
                  return {
                    method,
                    amount,
                    cashReceived:
                      method === "CASH"
                        ? amount +
                          (i === amounts.length - 1 ? Number(cash) - total : 0)
                        : undefined,
                    referenceNo: ref || undefined,
                  };
                }),
              });
            } else onConfirm(base);
          }}
        >
          {busy ? "กำลังบันทึก…" : "ยืนยันรับชำระเงิน"}
        </Button>
      </div>
    </Modal>
  );
}
