"use client";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { PageTitle, FormModal, fString } from "./shared";
export function StoreSettings() {
  const { data, action, notify } = useStore();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [branch, setBranch] = useState(false);
  const b = data.branch;
  return (
    <>
      <PageTitle
        title="ตั้งค่าร้านค้า"
        description="ข้อมูลสาขา การรับเงิน ภาษี และข้อความใบเสร็จ"
      >
        <Button variant="outline" onClick={() => setBranch(true)}>
          <Plus size={17} />
          เพิ่มสาขา
        </Button>
      </PageTitle>
      <form
        className="settings-form stack"
        key={b.id}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await action("settings", {
              storeName: fString(f, "storeName"),
              name: fString(f, "name"),
              address: fString(f, "address"),
              phone: fString(f, "phone"),
              taxId: fString(f, "taxId"),
              promptPayId: fString(f, "promptPayId"),
              promptPayName: fString(f, "promptPayName"),
              receiptHeader: fString(f, "receiptHeader"),
              receiptFooter: fString(f, "receiptFooter"),
              vatRate: Number(f.get("vatRate")),
              vatInclusive: f.get("vatInclusive") === "on",
              serviceChargeRate: Number(f.get("serviceChargeRate")),
            });
            notify("บันทึกการตั้งค่าแล้ว");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="panel stack">
          <h2>ข้อมูลร้าน</h2>
          <label className="field">
            ชื่อร้านค้า
            <input
              name="storeName"
              defaultValue={data.tenant.name}
              required
              minLength={2}
              maxLength={100}
            />
            <small>
              ชื่อที่แสดงบนหน้าขายและใบเสร็จ
              เปลี่ยนชื่อได้โดยลิงก์เข้าร้านเดิมยังใช้ได้
            </small>
          </label>
        </section>
        <section className="panel stack">
          <h2>ข้อมูลสาขา</h2>
          <div className="grid2">
            <label className="field">
              ชื่อสาขา
              <input name="name" defaultValue={b.name} required />
            </label>
            <label className="field">
              เบอร์โทรศัพท์
              <input name="phone" defaultValue={b.phone ?? ""} />
            </label>
          </div>
          <label className="field">
            ที่อยู่
            <textarea name="address" defaultValue={b.address ?? ""} />
          </label>
          <label className="field">
            เลขผู้เสียภาษี 13 หลัก
            <input
              name="taxId"
              pattern="([0-9]{13})?"
              defaultValue={b.taxId ?? ""}
            />
          </label>
        </section>
        <section className="panel stack">
          <h2>พร้อมเพย์รับเงินหน้าร้าน</h2>
          <div className="grid2">
            <label className="field">
              เบอร์โทร / เลขนิติบุคคล
              <input
                name="promptPayId"
                pattern="([0-9]{10}|[0-9]{13})?"
                defaultValue={b.promptPayId ?? ""}
              />
            </label>
            <label className="field">
              ชื่อบัญชี
              <input
                name="promptPayName"
                defaultValue={b.promptPayName ?? ""}
              />
            </label>
          </div>
          <small>ตรวจสอบชื่อบัญชีและยอดเงินเข้าก่อนยืนยันชำระทุกครั้ง</small>
        </section>
        <section className="panel stack">
          <h2>ภาษีและค่าบริการ</h2>
          <div className="grid2">
            <label className="field">
              VAT (%)
              <input
                name="vatRate"
                type="number"
                min="0"
                max="20"
                step="0.01"
                defaultValue={b.vatRate}
              />
            </label>
            <label className="field">
              Service charge (%)
              <input
                name="serviceChargeRate"
                type="number"
                min="0"
                max="30"
                step="0.01"
                defaultValue={b.serviceChargeRate}
              />
            </label>
          </div>
          <label className="check">
            <input
              name="vatInclusive"
              type="checkbox"
              defaultChecked={b.vatInclusive}
            />
            ราคาสินค้ารวม VAT แล้ว
          </label>
        </section>
        <section className="panel stack">
          <h2>ใบเสร็จ</h2>
          <label className="field">
            ข้อความหัวใบเสร็จ
            <input name="receiptHeader" defaultValue={b.receiptHeader ?? ""} />
          </label>
          <label className="field">
            ข้อความท้ายใบเสร็จ
            <input name="receiptFooter" defaultValue={b.receiptFooter ?? ""} />
          </label>
          <small>พิมพ์ผ่านเบราว์เซอร์ รองรับกระดาษ 58 และ 80 มม.</small>
        </section>
        {error && <p className="error">{error}</p>}
        <section className="panel stack">
          <h2>เครื่องขายที่ลงทะเบียน</h2>
          <small>
            {data.terminals.length} เครื่อง · โควตา{" "}
            {data.tenant.maxTerminals < 0
              ? "ไม่จำกัด"
              : data.tenant.maxTerminals}
          </small>
          {data.terminals.map((t) => (
            <div className="row between" key={t.id}>
              <div>
                <strong className="font-mono">{t.clientId.slice(0, 8)}</strong>
                <small style={{ display: "block" }}>
                  ใช้งานล่าสุด {new Date(t.lastSeenAt).toLocaleString("th-TH")}
                </small>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await action("terminals/revoke", { id: t.id });
                    notify(
                      "ยกเลิกการลงทะเบียนแล้ว เครื่องใหม่สามารถใช้โควตานี้ได้",
                    );
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                ปล่อยโควตาเครื่อง
              </Button>
            </div>
          ))}
        </section>
        <Button type="submit" disabled={busy}>
          <Save size={17} />
          {busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </Button>
      </form>
      {branch && (
        <FormModal
          title="เพิ่มสาขา"
          onClose={() => setBranch(false)}
          onSubmit={async (f) => {
            await action("branches", {
              name: fString(f, "name"),
              address: fString(f, "address"),
            });
            notify("เพิ่มสาขาแล้ว");
          }}
        >
          <label className="field">
            ชื่อสาขา
            <input name="name" required />
          </label>
          <label className="field">
            ที่อยู่
            <textarea name="address" />
          </label>
        </FormModal>
      )}
    </>
  );
}
