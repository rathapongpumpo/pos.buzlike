"use client";
import { useState } from "react";
import { Plus, Minus, Printer, Wallet } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PageTitle, Status, FormModal, fString, fNumber } from "./shared";
import { money } from "@/lib/money";
import type { Bootstrap } from "@/lib/view-types";
export function Shifts() {
  const { data, action, notify } = useStore();
  const [mode, setMode] = useState(""),
    [report, setReport] = useState<Bootstrap["shifts"][number] | null>(null);
  const shift = data.shifts.find((s) => s.status === "OPEN");
  const paid = data.orders.filter(
    (o) => o.shiftId === shift?.id && o.status === "PAID",
  );
  const cash = data.shiftCash;
  const movement = data.shiftMovements;
  return (
    <>
      <PageTitle
        title="เปิด–ปิดกะ"
        description="ควบคุมเงินสดและสรุปยอดขายประจำกะ"
      >
        <Button onClick={() => setMode(shift ? "close" : "open")}>
          <Wallet size={17} />
          {shift ? "ปิดกะและสรุปยอด" : "เปิดกะใหม่"}
        </Button>
      </PageTitle>
      {shift && (
        <>
          <div className="stats">
            {[
              ["เงินทอนตั้งต้น", Number(shift.startingCash)],
              ["ยอดขายเงินสด", cash],
              ["เงินเข้า / ออกสุทธิ", movement],
              ["เงินสดที่ควรมี", Number(shift.startingCash) + cash + movement],
            ].map(([label, value]) => (
              <div className="stat" key={String(label)}>
                <label>{label}</label>
                <strong>฿{money(value)}</strong>
              </div>
            ))}
          </div>
          <div className="row wrap section-space" style={{ marginBottom: 24 }}>
            <Button variant="outline" onClick={() => setMode("in")}>
              <Plus size={17} />
              นำเงินเข้า
            </Button>
            <Button variant="outline" onClick={() => setMode("out")}>
              <Minus size={17} />
              นำเงินออก
            </Button>
            <small>
              เปิดเมื่อ {new Date(shift.openedAt).toLocaleString("th-TH")}
            </small>
          </div>
        </>
      )}
      <div className="panel table-scroll" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>เปิดกะ</th>
              <th>ปิดกะ</th>
              <th>สถานะ</th>
              <th className="number">เงินตั้งต้น</th>
              <th className="number">เงินนับจริง</th>
              <th className="number">ขาด / เกิน</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.shifts.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.openedAt).toLocaleString("th-TH")}</td>
                <td>
                  {s.closedAt
                    ? new Date(s.closedAt).toLocaleString("th-TH")
                    : "—"}
                </td>
                <td>
                  <Status status={s.status} />
                </td>
                <td className="number">{money(s.startingCash)}</td>
                <td className="number">
                  {s.actualCash === null ? "—" : money(s.actualCash)}
                </td>
                <td className="number">
                  {s.cashDifference === null ? "—" : money(s.cashDifference)}
                </td>
                <td>
                  {s.status === "CLOSED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReport(s)}
                    >
                      <Printer size={15} />
                      Z-Report
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.shifts.length && (
          <div className="empty">เปิดกะเพื่อเริ่มขายออเดอร์แรก</div>
        )}
      </div>
      {mode && (
        <FormModal
          title={
            mode === "open"
              ? "เปิดกะแคชเชียร์"
              : mode === "close"
                ? "ปิดกะและนับเงินสด"
                : mode === "in"
                  ? "นำเงินเข้าลิ้นชัก"
                  : "นำเงินออกลิ้นชัก"
          }
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            if (mode === "open")
              await action("shifts/open", {
                startingCash: fNumber(f, "amount"),
              });
            else if (mode === "close") {
              const result = await action<Bootstrap["shifts"][number]>(
                "shifts/close",
                {
                  actualCash: fNumber(f, "amount"),
                  closingNote: fString(f, "note"),
                },
              );
              setReport(result);
            } else
              await action("shifts/cash", {
                amount: fNumber(f, "amount") * (mode === "out" ? -1 : 1),
                reason: fString(f, "note"),
              });
            notify("บันทึกเรียบร้อยแล้ว");
          }}
        >
          <label className="field">
            {mode === "close"
              ? "เงินสดที่นับได้จริง"
              : mode === "open"
                ? "เงินทอนตั้งต้น"
                : "จำนวนเงิน"}
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={mode === "open" ? 1000 : undefined}
              required
            />
          </label>
          {mode !== "open" && (
            <label className="field">
              {mode === "close" ? "หมายเหตุ" : "เหตุผล"}
              <textarea
                name="note"
                minLength={mode === "close" ? 0 : 3}
                required={mode !== "close"}
              />
            </label>
          )}
        </FormModal>
      )}
      <Modal
        title="Z-Report สรุปปิดกะ"
        open={!!report}
        onClose={() => setReport(null)}
      >
        {report && (
          <>
            <div className="receipt">
              <h2>{data.tenant.name}</h2>
              <div className="center">
                {data.branch.name}
                <br />
                Z-REPORT
                <br />
                {new Date(report.closedAt!).toLocaleString("th-TH")}
              </div>
              <hr />
              {[
                ["เงินทอนตั้งต้น", report.startingCash],
                ["เงินสดตามระบบ", report.expectedCash],
                ["เงินสดนับจริง", report.actualCash],
                ["ส่วนต่างขาด / เกิน", report.cashDifference],
              ].map(([k, v]) => (
                <div className="receipt-line" key={k ?? ""}>
                  <span>{k}</span>
                  <strong>{money(v)}</strong>
                </div>
              ))}
              <hr />
              <p>{report.closingNote}</p>
            </div>
            <Button
              className="full no-print section-space"
              onClick={() => window.print()}
            >
              <Printer size={17} />
              พิมพ์ 80 มม.
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}
