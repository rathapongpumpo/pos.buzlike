"use client";
import { useState } from "react";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
export function FormModal({
  title,
  onClose,
  onSubmit,
  children,
  submit = "บันทึก",
  wide = false,
  submitDisabled = false,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (f: FormData) => Promise<void>;
  children: React.ReactNode;
  submit?: string;
  wide?: boolean;
  submitDisabled?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={title} open onClose={() => !busy && onClose()} wide={wide}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await onSubmit(new FormData(e.currentTarget));
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            ยกเลิก
          </Button>
          <Button type="submit" disabled={busy || submitDisabled}>
            {busy ? "กำลังบันทึก…" : submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export const fString = (f: FormData, k: string) => String(f.get(k) ?? "");
export const fNumber = (f: FormData, k: string) => Number(f.get(k) ?? 0);
export function Status({ status }: { status: string }) {
  const label: Record<string, string> = {
    PAID: "ชำระแล้ว",
    OPEN: "ค้างชำระ",
    VOIDED: "ยกเลิก",
    REFUNDED: "คืนเงิน",
    PARTIALLY_REFUNDED: "คืนเงินบางส่วน",
    EXPIRED: "หมดเวลาชำระ",
    CANCELED: "ยกเลิกรายการ",
    FAILED: "ชำระไม่สำเร็จ",
    CLOSED: "ปิดแล้ว",
    PENDING: "รอตรวจสอบ",
    AWAITING_PAYMENT: "รอชำระ",
    QUEUED: "รอทำ",
    PREPARING: "กำลังทำ",
    READY: "พร้อมเสิร์ฟ",
    SERVED: "เสิร์ฟแล้ว",
    ACTIVE: "ใช้งาน",
    TRIALING: "ทดลองใช้",
    READ_ONLY: "อ่านอย่างเดียว",
    SUSPENDED: "ระงับ",
    LIFETIME_ACTIVE: "ซื้อขาด",
    PAST_DUE: "ค้างชำระ",
  };
  return (
    <span
      className={`pill ${["OPEN", "PENDING", "QUEUED", "PAST_DUE"].includes(status) ? "orange" : ["VOIDED", "REFUNDED", "SUSPENDED", "READ_ONLY"].includes(status) ? "red" : status === "CLOSED" ? "gray" : ""}`}
    >
      {label[status] ?? status}
    </span>
  );
}
