"use client";
import { useState } from "react";
import {
  Armchair,
  Plus,
  QrCode,
  Printer,
  MoveRight,
  Merge,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PageTitle, FormModal, fString, fNumber } from "./shared";
import { Payment, type PaymentValues } from "../pos/payment";
import { money } from "@/lib/money";
import type { Bootstrap } from "@/lib/view-types";
export function Tables() {
  const { data, action, notify } = useStore();
  const [zone, setZone] = useState("all"),
    [mode, setMode] = useState(""),
    [table, setTable] = useState<Bootstrap["tables"][number] | null>(null),
    [pay, setPay] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = table
    ? (data.tables.find((t) => t.id === table.id) ?? table)
    : null;
  const orders = data.orders.filter(
    (o) => o.tableId === current?.id && o.status === "OPEN",
  );
  const total = orders.reduce((s, o) => s + Number(o.grandTotal), 0);
  return (
    <>
      <PageTitle
        title="ผังโต๊ะ"
        description={`${data.tables.filter((t) => t.status === "AVAILABLE").length} โต๊ะว่าง · ${data.tables.filter((t) => t.status !== "AVAILABLE").length} โต๊ะกำลังใช้งาน`}
      >
        <Button variant="outline" onClick={() => setMode("zone")}>
          เพิ่มโซน
        </Button>
        <Button onClick={() => setMode("table")}>
          <Plus size={17} />
          เพิ่มโต๊ะ
        </Button>
      </PageTitle>
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={zone === "all" ? "active" : ""}
          onClick={() => setZone("all")}
        >
          ทุกโซน
        </button>
        {data.zones.map((z) => (
          <button
            key={z.id}
            className={zone === z.id ? "active" : ""}
            onClick={() => setZone(z.id)}
          >
            {z.name}
          </button>
        ))}
      </div>
      <div className="table-grid">
        {data.tables
          .filter((t) => zone === "all" || t.zoneId === zone)
          .map((t) => (
            <button
              key={t.id}
              className={`dining-table ${t.status === "OCCUPIED" ? "occupied" : t.status === "BILL_REQUESTED" ? "bill-requested" : ""}`}
              onClick={() => {
                setTable(t);
                setMode("detail");
              }}
            >
              <Armchair size={29} />
              <h3>{t.name}</h3>
              <span
                className={`pill ${t.status === "AVAILABLE" ? "" : t.status === "BILL_REQUESTED" ? "red" : "orange"}`}
              >
                {t.status === "AVAILABLE"
                  ? "ว่าง"
                  : t.status === "OCCUPIED"
                    ? "มีลูกค้า"
                    : "เรียกพนักงาน / เช็กบิล"}
              </span>
              <small>
                {t.seats} ที่นั่ง · {t.zone.name}
              </small>
              {t.status !== "AVAILABLE" && (
                <strong>
                  ฿
                  {money(
                    data.orders
                      .filter((o) => o.tableId === t.id && o.status === "OPEN")
                      .reduce((s, o) => s + Number(o.grandTotal), 0),
                  )}
                </strong>
              )}
            </button>
          ))}
      </div>
      {mode === "zone" && (
        <FormModal
          title="เพิ่มโซน"
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            await action("zones", { name: fString(f, "name") });
            notify("เพิ่มโซนแล้ว");
          }}
        >
          <label className="field">
            ชื่อโซน
            <input name="name" required />
          </label>
        </FormModal>
      )}
      {mode === "table" && (
        <FormModal
          title="เพิ่มโต๊ะ"
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            await action("tables", {
              name: fString(f, "name"),
              zoneId: fString(f, "zoneId"),
              seats: fNumber(f, "seats"),
            });
            notify("เพิ่มโต๊ะแล้ว");
          }}
        >
          <label className="field">
            ชื่อโต๊ะ
            <input name="name" required />
          </label>
          <label className="field">
            โซน
            <select name="zoneId">
              {data.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            จำนวนที่นั่ง
            <input
              name="seats"
              type="number"
              min="1"
              max="50"
              defaultValue="4"
            />
          </label>
        </FormModal>
      )}
      {mode === "detail" && current && (
        <Modal title={`โต๊ะ ${current.name}`} open onClose={() => setMode("")}>
          <div className="stack">
            {current.status === "AVAILABLE" ? (
              <Button
                onClick={async () => {
                  try {
                    await action(`tables/${current.id}/open`, {});
                    notify("เปิดโต๊ะแล้ว");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                เปิดโต๊ะ
              </Button>
            ) : (
              <>
                <div id="table-qr" style={{ textAlign: "center" }}>
                  <div className="qr-code">
                    <QRCodeSVG
                      value={`${window.location.origin}/m/${current.activeQrToken}`}
                      size={210}
                    />
                  </div>
                  <strong>
                    {data.tenant.name} · {current.name}
                  </strong>
                  <p className="muted">สแกนเพื่อสั่งอาหาร</p>
                </div>
                <div className="row between">
                  <a
                    href={`/m/${current.activeQrToken}`}
                    target="_blank"
                    className="btn outline"
                  >
                    <QrCode size={17} />
                    เปิดเมนูลูกค้า
                  </a>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const win = window.open(
                        "",
                        "_blank",
                        "width=400,height=600",
                      );
                      if (win) {
                        win.document.write(
                          `<html lang="th"><head><title>QR ${current.name}</title></head><body style="font-family:sans-serif;text-align:center">${document.getElementById("table-qr")?.innerHTML}</body></html>`,
                        );
                        win.document.close();
                        win.print();
                      }
                    }}
                  >
                    <Printer size={17} />
                    พิมพ์ QR
                  </Button>
                </div>
                <div className="divider" />
                {orders.map((o) => (
                  <div key={o.id}>
                    <strong>{o.orderNumber}</strong>
                    {o.items.map((i) => (
                      <div key={i.id} className="row between">
                        <span>
                          {i.quantity} × {i.productNameSnapshot}
                        </span>
                        <span>฿{money(i.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="row between">
                  <h3>ค้างชำระ</h3>
                  <h2>฿{money(total)}</h2>
                </div>
                {orders.length > 0 && (
                  <Button
                    onClick={() => {
                      setError("");
                      setPay(true);
                      setMode("");
                    }}
                  >
                    ชำระบิลโต๊ะ
                  </Button>
                )}
                <div className="row">
                  <Button variant="outline" onClick={() => setMode("move")}>
                    <MoveRight size={17} />
                    ย้ายโต๊ะ
                  </Button>
                  <Button variant="outline" onClick={() => setMode("merge")}>
                    <Merge size={17} />
                    รวมโต๊ะ
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  disabled={orders.length > 0}
                  onClick={async () => {
                    try {
                      await action(`tables/${current.id}/close`, {});
                      setMode("");
                      notify("ปิดโต๊ะและยกเลิก QR เดิมแล้ว");
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  เคลียร์โต๊ะและยกเลิก QR
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
      {["move", "merge"].includes(mode) && current && (
        <FormModal
          title={mode === "move" ? "ย้ายโต๊ะ" : "รวมโต๊ะ"}
          onClose={() => setMode("")}
          onSubmit={async (f) => {
            await action(`tables/${current.id}/${mode}`, {
              targetId: fString(f, "targetId"),
            });
            notify("ย้ายรายการไปโต๊ะปลายทางแล้ว");
          }}
        >
          <label className="field">
            โต๊ะปลายทาง
            <select name="targetId" required>
              <option value="">เลือกโต๊ะ</option>
              {data.tables
                .filter(
                  (t) =>
                    t.id !== current.id &&
                    (mode === "merge" || t.status === "AVAILABLE"),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="notice warning">QR ของโต๊ะต้นทางจะหมดอายุทันที</p>
        </FormModal>
      )}
      {pay && (
        <Payment
          total={total}
          onClose={() => setPay(false)}
          busy={busy}
          error={error}
          onConfirm={async (values: PaymentValues) => {
            setBusy(true);
            try {
              await action("orders/settle", {
                orderIds: orders.map((o) => o.id),
                ...values,
              });
              notify("ชำระเงินและเคลียร์โต๊ะแล้ว");
              setPay(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
