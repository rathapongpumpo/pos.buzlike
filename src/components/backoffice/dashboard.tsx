"use client";
import { useEffect, useState } from "react";
import { Download, ArrowUpRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { PageTitle, Status } from "./shared";
import { money } from "@/lib/money";
import { api } from "@/lib/client-api";
type Summary = {
  sales: number;
  bills: number;
  average: number;
  cash: number;
  hours: number[];
  best: { name: string; quantity: number; total: number }[];
};
export function Dashboard() {
  const { data, slug } = useStore();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [date, setDate] = useState(today),
    [summary, setSummary] = useState<Summary | null>(null),
    [summaryError, setSummaryError] = useState("");
  useEffect(() => {
    let active = true;
    setSummary(null);
    setSummaryError("");
    void api<Summary>(
      `/api/v1/${slug}/reports/summary?date=${date}&branchId=${data.branch.id}`,
    )
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((error) => {
        if (active) setSummaryError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [date, slug, data.orders, data.branch.id]);
  const low = data.ingredients.filter(
    (i) =>
      Number(i.branchStocks[0]?.currentQty ?? 0) <= Number(i.lowStockThreshold),
  );
  return (
    <>
      <PageTitle
        title="ภาพรวมร้านค้า"
        description="ติดตามยอดขายและสิ่งที่ต้องดูแลในวันนี้"
      >
        <input
          className="input"
          type="date"
          aria-label="วันที่รายงาน"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 155 }}
        />
        {data.tenant.enableExport ? (
          <Button asChild variant="outline">
            <a
              href={`/api/v1/${slug}/reports/export?branchId=${data.branch.id}`}
            >
              <Download size={17} />
              CSV
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled
            title="ส่งออกรายงานได้ในแพ็กเกจ Starter ขึ้นไป"
          >
            <Download size={17} />
            CSV
          </Button>
        )}
      </PageTitle>
      {summaryError && (
        <p className="error" role="alert">
          โหลดรายงานไม่สำเร็จ: {summaryError}
        </p>
      )}
      <div className="stats">
        {[
          ["ยอดขายสุทธิ", `฿${money(summary?.sales)}`, "จากบิลชำระแล้ว"],
          ["จำนวนบิล", String(summary?.bills ?? 0), "รายการขาย"],
          ["ยอดเฉลี่ยต่อบิล", `฿${money(summary?.average)}`, "บาท / บิล"],
          ["ยอดขายเงินสด", `฿${money(summary?.cash)}`, "ยอดรับในวันเลือก"],
        ].map(([title, value, caption]) => (
          <div className="stat" key={title}>
            <label>{title}</label>
            <strong>{value}</strong>
            <small>{caption}</small>
          </div>
        ))}
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="row between">
            <h2>ยอดขายตามช่วงเวลา</h2>
            <small>บาท · เวลาไทย</small>
          </div>
          <div
            className="chart-scroll"
            tabIndex={0}
            role="region"
            aria-label="กราฟยอดขายตามเวลา เลื่อนแนวนอนเพื่อดูทั้งหมด"
          >
            <div className="bars">
              {Array.from({ length: 12 }, (_, i) => {
                const value =
                  (summary?.hours[i * 2] ?? 0) +
                  (summary?.hours[i * 2 + 1] ?? 0);
                const max = Math.max(
                  1,
                  ...Array.from(
                    { length: 12 },
                    (_, j) =>
                      (summary?.hours[j * 2] ?? 0) +
                      (summary?.hours[j * 2 + 1] ?? 0),
                  ),
                );
                return (
                  <div className="bar-column" key={i}>
                    <small>
                      {value ? money(value).replace(".00", "") : ""}
                    </small>
                    <i
                      style={{
                        height: `${Math.max(1, (value / max) * 155)}px`,
                      }}
                    />
                    <span>{String(i * 2).padStart(2, "0")}:00</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>สินค้าขายดี</h2>
          {summary?.best.length ? (
            summary.best.slice(0, 5).map((p, i) => (
              <div className="best-row" key={p.name}>
                <span className="rank">0{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  <small style={{ display: "block" }}>
                    {p.quantity} รายการ
                  </small>
                </div>
                <strong>฿{money(p.total)}</strong>
              </div>
            ))
          ) : (
            <div className="empty">ยังไม่มียอดขายในวันนี้</div>
          )}
        </section>
      </div>
      <div className="report-grid section-space">
        <section className="panel">
          <div className="row between heading-row">
            <h2>รายการขายล่าสุด</h2>
            <Link
              className="row muted"
              href={`/${slug}/orders?branchId=${data.branch.id}`}
            >
              ดูทั้งหมด <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>เลขที่บิล</th>
                  <th>สถานะ</th>
                  <th className="number">ยอดสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.slice(0, 6).map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNumber}</td>
                    <td>
                      <Status status={o.status} />
                    </td>
                    <td className="number">฿{money(o.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.orders.length && (
              <div className="empty">ยังไม่มีรายการขาย</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="row heading-row">
            <AlertTriangle size={20} color="var(--warning)" />
            <h2>สต็อกใกล้หมด</h2>
          </div>
          {low.length ? (
            low.map((i) => (
              <div className="best-row" key={i.id}>
                <div style={{ flex: 1 }}>
                  <strong>{i.name}</strong>
                  <small style={{ display: "block" }}>
                    จุดสั่งซื้อ {money(i.lowStockThreshold)} {i.unit}
                  </small>
                </div>
                <span className="pill orange">
                  {money(i.branchStocks[0]?.currentQty ?? 0)} {i.unit}
                </span>
              </div>
            ))
          ) : (
            <p className="notice">วัตถุดิบเพียงพอสำหรับการขาย</p>
          )}
          <Link
            href={`/${slug}/${data.tenant.enableRecipeBom ? "inventory" : "products"}?branchId=${data.branch.id}`}
            className="row muted section-space"
          >
            {data.tenant.enableRecipeBom
              ? "จัดการคลังวัตถุดิบ"
              : "จัดการสต็อกสินค้า"}{" "}
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
