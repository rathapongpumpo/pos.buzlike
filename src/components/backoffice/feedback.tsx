"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { pilotLabels, pilotDate, type FeedbackRow } from "@/lib/pilot-labels";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { PageTitle } from "./shared";
export function FeedbackHistory({ rows }: { rows: FeedbackRow[] }) {
  return (
    <div className="pilot-list">
      {!rows.length && <p className="pilot-empty">ยังไม่มีเรื่องที่ส่งมา</p>}
      {rows.map((row) => (
        <article className="pilot-item" key={row.id}>
          <div className="pilot-item-heading">
            <strong>{pilotLabels[row.category]}</strong>
            <span className="pilot-status">{pilotLabels[row.status]}</span>
          </div>
          <p className="pilot-message">{row.message}</p>
          <p className="pilot-meta">
            {row.branch.name} · {row.staff.displayName} ·{" "}
            {pilotDate(row.createdAt)}
          </p>
          {!!row.history.length && (
            <details>
              <summary>ติดตามการดำเนินการ ({row.history.length})</summary>
              <ol className="pilot-timeline">
                {row.history.map((h) => (
                  <li key={h.id}>
                    <strong>{pilotLabels[h.toStatus]}</strong>
                    <p className="pilot-message">{h.note}</p>
                    <small>{pilotDate(h.createdAt)}</small>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
export function Feedback() {
  const { data, slug } = useStore();
  const [result, setResult] = useState<{
      rows: FeedbackRow[];
      enrolled: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef({ fingerprint: "", key: "" });
  const endpoint = `/api/v1/${slug}/feedback?branchId=${encodeURIComponent(data.branch.id)}`;
  useEffect(() => {
    let alive = true;
    setResult(null);
    setError("");
    api<{ rows: FeedbackRow[]; enrolled: boolean }>(endpoint)
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [endpoint]);
  return (
    <section className="pilot-workspace">
      <PageTitle
        title="แจ้งปัญหาและเสนอแนะ"
        description="ช่วยปรับ BUZLIKE POS ให้เหมาะกับงานของร้านคุณ"
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {!result ? (
        <p role="status">
          {error
            ? "โหลดข้อมูลไม่สำเร็จ กรุณาโหลดหน้านี้อีกครั้ง"
            : "กำลังโหลดข้อมูล…"}
        </p>
      ) : (
        <div className="pilot-feedback-grid">
          <div className="pilot-panel">
            <h2>ส่งฟีดแบ็ก</h2>
            <p className="pilot-meta">
              สาขา {data.branch.name} · ผู้ส่ง {data.staff.displayName}
            </p>
            {!result.enrolled ? (
              <p>
                ฟอร์มนี้สำหรับร้านที่เข้าร่วมโครงการนำร่อง
                หากต้องการความช่วยเหลือ ติดต่อ{" "}
                <a href="mailto:support@buzlike.com">support@buzlike.com</a>
              </p>
            ) : (
              <form
                className="pilot-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  const body = {
                    category: String(f.get("category")),
                    message: String(f.get("message")).trim(),
                    pageKey: String(f.get("pageKey")),
                    deviceClass:
                      window.innerWidth < 600
                        ? "MOBILE"
                        : window.innerWidth <= 1100
                          ? "TABLET"
                          : "DESKTOP",
                    ...(f.get("rating")
                      ? { optionalRating: Number(f.get("rating")) }
                      : {}),
                  };
                  const fingerprint = JSON.stringify(body);
                  if (retry.current.fingerprint !== fingerprint)
                    retry.current = { fingerprint, key: crypto.randomUUID() };
                  setBusy(true);
                  setError("");
                  setSuccess("");
                  try {
                    await api(endpoint, {
                      ...body,
                      requestKey: retry.current.key,
                    });
                    setSuccess(
                      "ส่งเรื่องแล้ว ติดตามความคืบหน้าได้ที่รายการของคุณ",
                    );
                    form.reset();
                    retry.current = { fingerprint: "", key: "" };
                    setResult(await api(endpoint));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy}>
                  <label className="field">
                    ประเภทเรื่อง
                    <select name="category">
                      {["BUG", "USABILITY", "FEATURE", "GENERAL"].map((k) => (
                        <option value={k} key={k}>
                          {pilotLabels[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    หน้าที่พบปัญหา
                    <select name="pageKey">
                      <option value="pos">ขายหน้าร้าน</option>
                      <option value="products">สินค้า</option>
                      <option value="orders">รายการขาย</option>
                      <option value="inventory">คลังวัตถุดิบ</option>
                      <option value="tables">ผังโต๊ะ</option>
                      <option value="kds">จอครัว</option>
                      <option value="shifts">เปิด–ปิดกะ</option>
                      <option value="staff">พนักงาน</option>
                      <option value="settings">ตั้งค่า</option>
                      <option value="billing">แพ็กเกจ</option>
                      <option value="dashboard">ภาพรวม</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>
                  <label className="field">
                    รายละเอียด
                    <textarea
                      name="message"
                      minLength={10}
                      maxLength={2000}
                      required
                      rows={5}
                      placeholder="กำลังทำอะไร พบปัญหาตรงไหน และอยากให้ปรับอย่างไร"
                    />
                  </label>
                  <p className="pilot-meta">
                    10–2,000 ตัวอักษร กรุณาอย่าใส่รหัสผ่าน PIN หรือข้อมูลลูกค้า
                  </p>
                  <label className="field">
                    ความง่ายในการใช้งาน (ไม่บังคับ)
                    <select name="rating">
                      <option value="">ไม่ระบุ</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} —{" "}
                          {n === 1
                            ? "ยากมาก"
                            : n === 5
                              ? "ง่ายมาก"
                              : n === 3
                                ? "ปานกลาง"
                                : n === 2
                                  ? "ค่อนข้างยาก"
                                  : "ค่อนข้างง่าย"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit">
                    {busy ? "กำลังส่ง…" : "ส่งฟีดแบ็ก"}
                  </Button>
                </fieldset>
              </form>
            )}
          </div>
          <div className="pilot-panel">
            <h2>
              {data.staff.role === "OWNER"
                ? "เรื่องทั้งหมดของร้าน"
                : "เรื่องของคุณในสาขานี้"}
            </h2>
            <p className="pilot-meta">แสดงล่าสุดไม่เกิน 100 เรื่อง</p>
            <FeedbackHistory rows={result.rows} />
          </div>
        </div>
      )}
    </section>
  );
}
