"use client";
import { useState } from "react";
import { Search, Download, Printer } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PageTitle, Status, FormModal, fString } from "./shared";
import { ThermalReceipt } from "../pos/receipt";
import { Payment } from "../pos/payment";
import type { OrderView } from "@/lib/view-types";
import { money } from "@/lib/money";
export function Orders() {
  const { data, slug, action, notify } = useStore();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL"),
    [receipt, setReceipt] = useState<OrderView | null>(null),
    [cancel, setCancel] = useState<{ order: OrderView; type: string } | null>(
      null,
    ),
    [pay, setPay] = useState<OrderView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const isManager = ["OWNER", "MANAGER"].includes(data.staff.role);
  return (
    <>
      <PageTitle
        title="รายการขาย"
        description="รายการล่าสุดสูงสุด 200 บิล · ส่งออก CSV เพื่อดูประวัติทั้งหมด"
      >
        {isManager && (
          <Button asChild variant="outline">
            <a
              href={`/api/v1/${slug}/reports/export?branchId=${data.branch.id}`}
            >
              <Download size={17} />
              ส่งออก CSV
            </a>
          </Button>
        )}
      </PageTitle>
      <div className="row wrap" style={{ marginBottom: 22 }}>
        <div className="search" style={{ flex: 1, minWidth: 220 }}>
          <Search size={20} />
          <input
            placeholder="ค้นหาเลขที่บิล หรือชื่อสินค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          aria-label="กรองสถานะบิล"
          style={{ width: 160 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">ทุกสถานะ</option>
          <option value="PAID">ชำระแล้ว</option>
          <option value="OPEN">ค้างชำระ</option>
          <option value="VOIDED">ยกเลิก</option>
          <option value="REFUNDED">คืนเงิน</option>
        </select>
      </div>
      <div className="panel table-scroll" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>เลขที่บิล</th>
              <th>วันเวลา</th>
              <th>โต๊ะ / ประเภท</th>
              <th>สถานะ</th>
              <th className="number">ยอดสุทธิ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {data.orders
              .filter(
                (o) =>
                  (status === "ALL" || o.status === status) &&
                  `${o.orderNumber} ${o.items.map((i) => i.productNameSnapshot).join(" ")}`.includes(
                    search,
                  ),
              )
              .map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.orderNumber}</strong>
                    <small style={{ display: "block" }}>
                      คิว #{o.queueNumber}
                    </small>
                  </td>
                  <td>{new Date(o.createdAt).toLocaleString("th-TH")}</td>
                  <td>
                    {o.table?.name ??
                      (o.orderType === "TAKEAWAY"
                        ? "กลับบ้าน"
                        : o.orderType === "DELIVERY"
                          ? "เดลิเวอรี่"
                          : "ทานที่ร้าน")}
                  </td>
                  <td>
                    <Status status={o.status} />
                  </td>
                  <td className="number">฿{money(o.grandTotal)}</td>
                  <td>
                    <div className="row">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReceipt(o)}
                      >
                        ดูบิล
                      </Button>
                      {o.status === "OPEN" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setError("");
                            setPay(o);
                          }}
                        >
                          รับชำระ
                        </Button>
                      )}
                      {isManager && ["OPEN", "PAID"].includes(o.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setCancel({
                              order: o,
                              type: o.status === "PAID" ? "refund" : "void",
                            })
                          }
                        >
                          {o.status === "PAID" ? "คืนเงิน" : "ยกเลิก"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!data.orders.length && <div className="empty">ยังไม่มีรายการขาย</div>}
      </div>
      <Modal
        title="รายละเอียดบิล"
        open={!!receipt}
        onClose={() => setReceipt(null)}
      >
        {receipt && (
          <>
            <div className="row between no-print" style={{ marginBottom: 20 }}>
              <Status status={receipt.status} />
              <Button onClick={() => window.print()}>
                <Printer size={17} />
                พิมพ์ซ้ำ
              </Button>
            </div>
            <ThermalReceipt
              order={receipt}
              branch={data.branch}
              storeName={data.tenant.name}
            />
            {receipt.voidReason && (
              <p className="error no-print section-space">
                เหตุผล: {receipt.voidReason}
              </p>
            )}
          </>
        )}
      </Modal>
      {cancel && (
        <FormModal
          title={`${cancel.type === "refund" ? "คืนเงิน" : "ยกเลิกบิล"} · ${cancel.order.orderNumber}`}
          onClose={() => setCancel(null)}
          onSubmit={async (f) => {
            await action(`orders/${cancel.order.id}/${cancel.type}`, {
              reason: fString(f, "reason"),
              pin: fString(f, "pin"),
            });
            notify("บันทึกและคืนสต็อกแล้ว");
          }}
        >
          <p className="notice warning">
            ยอด ฿{money(cancel.order.grandTotal)} ·
            ระบบจะคืนสต็อกและบันทึกประวัติ
            {cancel.type === "refund"
              ? " กรุณาคืนเงินจริงให้ลูกค้าผ่านช่องทางเดิม"
              : ""}
          </p>
          <label className="field">
            เหตุผล
            <textarea name="reason" minLength={3} required />
          </label>
          <label className="field">
            PIN ของผู้จัดการที่เข้าสู่ระบบ
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              required
            />
          </label>
        </FormModal>
      )}
      {pay && (
        <Payment
          total={Number(pay.grandTotal)}
          busy={busy}
          error={error}
          onClose={() => setPay(null)}
          onConfirm={async (values) => {
            setBusy(true);
            try {
              await action("orders/settle", { orderIds: [pay.id], ...values });
              setPay(null);
              notify("รับชำระเรียบร้อยแล้ว");
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
