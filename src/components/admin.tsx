"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Store,
  Wallet,
  Layers,
  ChartNoAxesCombined,
  LogOut,
  Plus,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { money } from "@/lib/money";
import { Button } from "./ui/button";
import {
  PageTitle,
  Status,
  FormModal,
  fString,
  fNumber,
} from "./backoffice/shared";
import type { Bootstrap } from "@/lib/view-types";
import { AdminPilot } from "./admin-pilot";
import { AdminFeedback } from "./admin-feedback";
import { MessageSquare, Ticket } from "lucide-react";
type Data = {
  tenants: (Bootstrap["tenant"] & {
    owner: { email: string; fullName: string };
  })[];
  payments: (Bootstrap["payments"][number] & {
    tenant: { name: string; slug: string };
  })[];
  plans: Bootstrap["plans"];
  coupons: {
    code: string;
    percent: number;
    isActive: boolean;
    expiresAt: string | null;
  }[];
  emailPending: number;
  emailFailed: number;
  smtpConfigured: boolean;
};
export function Admin() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState("tenants"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<{ type: string; id: string } | null>(null);
  const refresh = async () => {
    try {
      setData(await api<Data>("/api/admin"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const act = async (body: unknown) => {
    await api("/api/admin", body);
    await refresh();
  };
  const mrr =
    data?.tenants
      .filter((t) => t.subscriptionStatus === "ACTIVE")
      .reduce(
        (s, t) =>
          s +
          Number(data.plans.find((p) => p.code === t.planCode)?.price ?? 0) /
            (t.planCode.includes("YEARLY") ? 12 : 1),
        0,
      ) ?? 0;
  const paid = data?.payments.filter((p) => p.status === "PAID") ?? [];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          BUZLIKE <b>POS</b>
        </a>
        <nav>
          {[
            ["tenants", "ร้านค้าทั้งหมด", Store],
            ["payments", "การชำระเงิน", Wallet],
            ["plans", "แพ็กเกจและคูปอง", Layers],
            ["analytics", "ภาพรวมแพลตฟอร์ม", ChartNoAxesCombined],
            ["pilot", "โครงการนำร่อง", Ticket],
            ["feedback", "ฟีดแบ็ก", MessageSquare],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              aria-label={String(label)}
              title={String(label)}
              className={`nav-link ${tab === key ? "active" : ""}`}
              style={{
                border: 0,
                color: "inherit",
                textAlign: "left",
                background: tab === key ? undefined : "transparent",
              }}
              onClick={() => setTab(String(key))}
            >
              {typeof Icon !== "string" && <Icon />}
              <span>{String(label)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">Platform administration</div>
      </aside>
      <header className="app-header">
        <strong>
          <span className="admin-header-brand">BUZLIKE · </span>ผู้ดูแลระบบ
        </strong>
        <Button
          variant="ghost"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut size={17} />
          ออกจากระบบ
        </Button>
      </header>
      <main className="app-main">
        <nav className="pilot-admin-tabs" aria-label="ส่วนงานผู้ดูแล">
          {[
            ["tenants", "ร้านค้า"],
            ["payments", "การชำระเงิน"],
            ["plans", "แพ็กเกจ"],
            ["analytics", "ภาพรวม"],
            ["pilot", "นำร่อง"],
            ["feedback", "ฟีดแบ็ก"],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "outline"}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </nav>
        <PageTitle
          title={
            tab === "tenants"
              ? "ร้านค้าทั้งหมด"
              : tab === "payments"
                ? "ตรวจสอบการชำระเงิน"
                : tab === "plans"
                  ? "แพ็กเกจและคูปอง"
                  : tab === "pilot"
                    ? "โครงการนำร่อง"
                    : tab === "feedback"
                      ? "ฟีดแบ็กจากร้าน"
                      : "ภาพรวมแพลตฟอร์ม"
          }
          description="Super Admin · BUZLIKE SYSTEMS"
        />
        {error && <p className="error">{error}</p>}
        {tab === "pilot" ? (
          <AdminPilot />
        ) : tab === "feedback" ? (
          <AdminFeedback />
        ) : (
          data && (
            <>
              <div className="stats">
                {[
                  ["ร้านค้าทั้งหมด", data.tenants.length],
                  [
                    "กำลังทดลองใช้",
                    data.tenants.filter(
                      (t) => t.subscriptionStatus === "TRIALING",
                    ).length,
                  ],
                  ["MRR", `฿${money(mrr)}`],
                  [
                    "ยอดซื้อขาดสะสม",
                    `฿${money(paid.filter((p) => p.planCode === "LIFETIME_BUYOUT").reduce((s, p) => s + Number(p.amount), 0))}`,
                  ],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <label>{label}</label>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {tab === "tenants" && (
                <>
                  <input
                    className="input"
                    placeholder="ค้นหาร้านหรืออีเมล"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ maxWidth: 420, marginBottom: 20 }}
                  />
                  <div className="panel table-scroll" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>ร้านค้า</th>
                          <th>เจ้าของร้าน</th>
                          <th>แพ็กเกจ</th>
                          <th>สถานะ</th>
                          <th>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tenants
                          .filter((t) =>
                            `${t.name} ${t.slug} ${t.owner.email}`.includes(
                              search,
                            ),
                          )
                          .map((t) => (
                            <tr key={t.id}>
                              <td>
                                <strong>{t.name}</strong>
                                <small style={{ display: "block" }}>
                                  {t.slug}
                                </small>
                              </td>
                              <td>{t.owner.email}</td>
                              <td>
                                {
                                  data.plans.find((p) => p.code === t.planCode)
                                    ?.name
                                }
                              </td>
                              <td>
                                <Status status={t.subscriptionStatus} />
                              </td>
                              <td>
                                <div className="row">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setEdit({ type: "tenant", id: t.id })
                                    }
                                  >
                                    จัดการ
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === "payments" && (
                <>
                  <div
                    className="notice row between"
                    style={{ marginBottom: 20 }}
                  >
                    <span>
                      อีเมลรอส่ง {data.emailPending} · ส่งไม่สำเร็จ{" "}
                      {data.emailFailed}
                      {!data.smtpConfigured && " · ยังไม่ได้ตั้งค่า SMTP"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await act({ action: "retryEmail" });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      เข้าคิวส่งอีเมลอีกครั้ง
                    </Button>
                  </div>
                  <div className="panel table-scroll" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>ใบแจ้งหนี้</th>
                          <th>ร้านค้า</th>
                          <th className="number">ยอดเงิน</th>
                          <th>สถานะ</th>
                          <th>สลิป</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{p.invoiceNumber}</td>
                            <td>{p.tenant.name}</td>
                            <td className="number">฿{money(p.totalAmount)}</td>
                            <td>
                              <Status status={p.status} />
                            </td>
                            <td>
                              {p.slipImageUrl ? (
                                <a
                                  href={`/api/billing/slip?id=${p.id}`}
                                  target="_blank"
                                  style={{ color: "var(--teal)" }}
                                >
                                  เปิดสลิป
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {p.status === "PENDING" && p.slipImageUrl && (
                                <div className="row">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      setEdit({ type: "approve", id: p.id })
                                    }
                                  >
                                    ตรวจและอนุมัติ
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.payments.length && (
                      <p className="empty">ยังไม่มีรายการชำระเงิน</p>
                    )}
                  </div>
                </>
              )}
              {tab === "plans" && (
                <>
                  <div className="panel table-scroll" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>แพ็กเกจ</th>
                          <th className="number">ราคาไม่รวม VAT</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.plans.map((p) => (
                          <tr key={p.code}>
                            <td>{p.name}</td>
                            <td className="number">฿{money(p.price)}</td>
                            <td>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setEdit({ type: "price", id: p.code })
                                }
                              >
                                แก้ไขราคา
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="row between section-space">
                    <h2>คูปองส่วนลด</h2>
                    <Button onClick={() => setEdit({ type: "coupon", id: "" })}>
                      <Plus size={17} />
                      สร้างคูปอง
                    </Button>
                  </div>
                  <div
                    className="panel table-scroll section-space"
                    style={{ padding: 0 }}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>รหัสคูปอง</th>
                          <th>ส่วนลด</th>
                          <th>สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.coupons.map((c) => (
                          <tr key={c.code}>
                            <td>{c.code}</td>
                            <td>{c.percent}%</td>
                            <td>{c.isActive ? "เปิดใช้" : "ปิดใช้"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === "analytics" && (
                <div className="report-grid">
                  <div className="panel stack">
                    <h2>รายได้แพลตฟอร์ม</h2>
                    <div className="row between">
                      <span>ARR</span>
                      <strong>฿{money(mrr * 12)}</strong>
                    </div>
                    <div className="row between">
                      <span>รายได้ชำระแล้ว (ก่อน VAT)</span>
                      <strong>
                        ฿{money(paid.reduce((s, p) => s + Number(p.amount), 0))}
                      </strong>
                    </div>
                    <div className="row between">
                      <span>ร้านสมาชิกที่ชำระแล้ว</span>
                      <strong>
                        {
                          data.tenants.filter(
                            (t) => t.subscriptionStatus === "ACTIVE",
                          ).length
                        }
                      </strong>
                    </div>
                    <div className="row between">
                      <span>ร้านซื้อขาด</span>
                      <strong>
                        {data.tenants.filter((t) => t.isLifetime).length}
                      </strong>
                    </div>
                  </div>
                  <div className="panel stack">
                    <h2>สถานะร้าน</h2>
                    {[
                      "TRIALING",
                      "ACTIVE",
                      "LIFETIME_ACTIVE",
                      "PAST_DUE",
                      "READ_ONLY",
                      "SUSPENDED",
                    ].map((s) => (
                      <div className="row between" key={s}>
                        <Status status={s} />
                        <strong>
                          {
                            data.tenants.filter(
                              (t) => t.subscriptionStatus === s,
                            ).length
                          }
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {edit?.type === "tenant" && (
                <FormModal
                  title={`จัดการ ${data.tenants.find((t) => t.id === edit.id)?.name}`}
                  onClose={() => setEdit(null)}
                  onSubmit={async (f) => {
                    const selected = fString(f, "action");
                    await act({
                      action: selected,
                      tenantId: edit.id,
                      days: fNumber(f, "days"),
                      planCode: fString(f, "plan"),
                    });
                  }}
                >
                  <label className="field">
                    การดำเนินการ
                    <select name="action">
                      <option value="extend">ขยายทดลองใช้ฟรี</option>
                      <option value="plan">เปลี่ยนแพ็กเกจด้วยมือ</option>
                      <option value="suspend">ระงับร้านค้า</option>
                      <option value="restore">ยกเลิกการระงับ</option>
                    </select>
                  </label>
                  <label className="field">
                    วันทดลองเพิ่ม
                    <select name="days">
                      <option value="7">7 วัน</option>
                      <option value="30">30 วัน</option>
                    </select>
                  </label>
                  <label className="field">
                    แพ็กเกจใหม่
                    <select name="plan">
                      {data.plans.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </FormModal>
              )}
              {edit?.type === "price" && (
                <FormModal
                  title="แก้ไขราคาแพ็กเกจ"
                  onClose={() => setEdit(null)}
                  onSubmit={async (f) => {
                    await act({
                      action: "price",
                      code: edit.id,
                      price: fNumber(f, "price"),
                    });
                  }}
                >
                  <label className="field">
                    ราคา (ไม่รวม VAT)
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={
                        data.plans.find((p) => p.code === edit.id)?.price
                      }
                      required
                    />
                  </label>
                </FormModal>
              )}
              {edit?.type === "coupon" && (
                <FormModal
                  title="สร้าง / แก้ไขคูปอง"
                  onClose={() => setEdit(null)}
                  onSubmit={async (f) => {
                    await act({
                      action: "coupon",
                      code: fString(f, "code").toUpperCase(),
                      percent: fNumber(f, "percent"),
                      isActive: f.get("active") === "on",
                      expiresAt: fString(f, "expires") || undefined,
                    });
                  }}
                >
                  <label className="field">
                    รหัส
                    <input name="code" pattern="[A-Za-z0-9-]+" required />
                  </label>
                  <label className="field">
                    ส่วนลด %
                    <input
                      name="percent"
                      type="number"
                      min="1"
                      max="99"
                      required
                    />
                  </label>
                  <label className="field">
                    วันหมดอายุ
                    <input name="expires" type="date" />
                  </label>
                  <label className="check">
                    <input name="active" type="checkbox" defaultChecked />
                    เปิดใช้งาน
                  </label>
                </FormModal>
              )}
              {edit?.type === "approve" && (
                <FormModal
                  title="ตรวจสอบหลักฐานการโอน"
                  onClose={() => setEdit(null)}
                  onSubmit={async (f) => {
                    const p = data.payments.find((p) => p.id === edit.id)!;
                    await act({
                      action: fString(f, "result"),
                      tenantId: p.tenantId,
                      paymentId: p.id,
                    });
                  }}
                >
                  <p className="notice">
                    ตรวจสอบบัญชีผู้รับ ยอดเงิน
                    และเลขอ้างอิงกับรายการเงินจริงก่อนอนุมัติ
                  </p>
                  <a
                    className="btn outline"
                    href={`/api/billing/slip?id=${edit.id}`}
                    target="_blank"
                  >
                    เปิดภาพสลิป
                  </a>
                  <label className="field">
                    ผลการตรวจสอบ
                    <select name="result">
                      <option value="approve">
                        อนุมัติและเปิดใช้งานแพ็กเกจ
                      </option>
                      <option value="reject">ไม่อนุมัติ</option>
                    </select>
                  </label>
                </FormModal>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
