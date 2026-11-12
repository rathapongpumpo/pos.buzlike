"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { pilotLabels, type FeedbackRow } from "@/lib/pilot-labels";
import { FeedbackHistory } from "./backoffice/feedback";
import { FormModal, fString } from "./backoffice/shared";
import { Button } from "./ui/button";
type TenantChoice = {
  id: string;
  name: string;
  businessType: string;
  branches: { id: string; name: string }[];
};
export function AdminFeedback() {
  const [data, setData] = useState<{
      rows: FeedbackRow[];
      tenants: TenantChoice[];
    } | null>(null),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<FeedbackRow | null>(null);
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const refresh = useCallback(async () => {
    setData(await api(`/api/admin/feedback?${query}`));
  }, [query]);
  useEffect(() => {
    let alive = true;
    setError("");
    api<{ rows: FeedbackRow[]; tenants: TenantChoice[] }>(
      `/api/admin/feedback?${query}`,
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [query]);
  const setFilter = (k: string, value: string) => {
    setData((old) => (old ? { ...old, rows: [] } : old));
    setFilters((f) => ({
      ...f,
      [k]: value,
      ...(k === "tenantId" ? { branchId: "" } : {}),
    }));
  };
  return (
    <section className="pilot-workspace">
      <p className="pilot-meta">
        แสดงล่าสุดไม่เกิน 100 เรื่อง
        บันทึกถึงลูกค้าจะแสดงในประวัติการติดตามของร้าน
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="pilot-filters">
        <label className="field">
          ร้าน
          <select
            value={filters.tenantId ?? ""}
            onChange={(e) => setFilter("tenantId", e.target.value)}
          >
            <option value="">ทุกร้าน</option>
            {data?.tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          สาขา
          <select
            value={filters.branchId ?? ""}
            onChange={(e) => setFilter("branchId", e.target.value)}
          >
            <option value="">ทุกสาขา</option>
            {data?.tenants
              .filter((t) => !filters.tenantId || t.id === filters.tenantId)
              .flatMap((t) =>
                t.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t.name} · {b.name}
                  </option>
                )),
              )}
          </select>
        </label>
        <label className="field">
          ประเภทธุรกิจ
          <select
            value={filters.businessType ?? ""}
            onChange={(e) => setFilter("businessType", e.target.value)}
          >
            <option value="">ทุกธุรกิจ</option>
            {Array.from(new Set(data?.tenants.map((t) => t.businessType))).map(
              (k) => (
                <option key={k} value={k}>
                  {(
                    {
                      CAFE_BEVERAGE: "คาเฟ่ / เครื่องดื่ม",
                      RESTAURANT: "ร้านอาหาร",
                      RETAIL_SHOP: "ร้านค้าปลีก",
                      SERVICE: "บริการ",
                      GENERAL: "อื่น ๆ",
                    } as Record<string, string>
                  )[k] ?? k}
                </option>
              ),
            )}
          </select>
        </label>
        {[
          ["category", "หมวด", ["BUG", "USABILITY", "FEATURE", "GENERAL"]],
          ["severity", "ความรุนแรง", ["P3", "P2", "P1", "P0"]],
          ["status", "สถานะ", ["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED"]],
          ["deviceClass", "อุปกรณ์", ["MOBILE", "TABLET", "DESKTOP"]],
        ].map(([key, label, options]) => (
          <label className="field" key={String(key)}>
            {label}
            <select
              value={filters[String(key)] ?? ""}
              onChange={(e) => setFilter(String(key), e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {(options as string[]).map((k) => (
                <option key={k} value={k}>
                  {pilotLabels[k]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Button
        variant="outline"
        onClick={() => void refresh().catch((e) => setError(e.message))}
      >
        โหลดข้อมูลล่าสุด
      </Button>
      {!data ? (
        <p role="status">กำลังโหลด…</p>
      ) : (
        <div className="pilot-list">
          {!data.rows.length && (
            <p className="pilot-empty">ไม่พบเรื่องตามตัวกรอง</p>
          )}
          {data.rows.map((row) => (
            <div className="pilot-panel" key={row.id}>
              <div className="pilot-item-heading">
                <strong>{row.tenant?.name}</strong>
                <Button variant="outline" onClick={() => setEdit(row)}>
                  รับเรื่อง / อัปเดต
                </Button>
              </div>
              <p className="pilot-meta">
                {pilotLabels[row.deviceClass]} · หน้า {row.pageKey} · ความรุนแรง{" "}
                {row.severity ? pilotLabels[row.severity] : "ยังไม่จัดระดับ"}
                {row.optionalRating && ` · ความง่าย ${row.optionalRating}/5`}
              </p>
              <FeedbackHistory rows={[row]} />
            </div>
          ))}
        </div>
      )}
      {edit && (
        <FormModal
          title="อัปเดตเรื่องถึงลูกค้า"
          onClose={() => setEdit(null)}
          onSubmit={async (f) => {
            await api("/api/admin/feedback", {
              id: edit.id,
              expectedStatus: edit.status,
              expectedHistoryId: edit.history.at(-1)?.id ?? null,
              status: fString(f, "status"),
              severity: fString(f, "severity"),
              note: fString(f, "note"),
            });
            await refresh();
          }}
        >
          <label className="field">
            สถานะ
            <select name="status" defaultValue={edit.status}>
              {["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED"].map((k) => (
                <option key={k} value={k}>
                  {pilotLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            ความรุนแรง
            <select name="severity" defaultValue={edit.severity ?? "P2"}>
              {["P3", "P2", "P1", "P0"].map((k) => (
                <option key={k} value={k}>
                  {pilotLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            บันทึกถึงลูกค้า
            <textarea
              name="note"
              minLength={3}
              maxLength={2000}
              required
              rows={4}
            />
          </label>
        </FormModal>
      )}
    </section>
  );
}
