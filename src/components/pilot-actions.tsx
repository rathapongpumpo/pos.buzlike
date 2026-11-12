"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";

export function PilotAction({
  endpoint,
  body = {},
  label,
  secondary = false,
}: {
  endpoint: string;
  body?: object;
  label: string;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <div className="pilot-action" aria-busy={busy}>
      <Button
        className="full"
        variant={secondary ? "outline" : "default"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await api<{ next?: string }>(endpoint, body);
            if (endpoint === "/api/pilot/context")
              window.location.replace("/pilot");
            else if (result.next) window.location.assign(result.next);
            else window.location.reload();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "กำลังดำเนินการ…" : label}
      </Button>
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function PilotStoreChoice({
  enrollmentId,
  stores,
  canCreate,
}: {
  enrollmentId: string;
  stores: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const [selected, setSelected] = useState(stores.length ? stores[0].id : "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <form
      className="pilot-store-choice"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        if (!selected && canCreate) {
          try {
            const { draft } = await api<{
              draft: { completedSlug: string | null; version: number } | null;
            }>("/api/onboarding/draft");
            if (draft?.completedSlug)
              await api("/api/onboarding/draft", { version: draft.version });
            window.location.assign("/onboarding?new=1");
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
          return;
        }
        try {
          const result = await api<{ next: string }>("/api/pilot/activate", {
            enrollmentId,
            tenantId: selected,
          });
          window.location.assign(result.next);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {stores.length > 0 && (
        <label className="field">
          ธุรกิจที่จะรับสิทธิ์
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
            {canCreate && <option value="">สร้างร้านใหม่</option>}
          </select>
        </label>
      )}
      <p className="muted">
        {selected
          ? "ใช้ร้าน สินค้า และข้อมูลเดิม เริ่มสิทธิ์ 30 วันเมื่อกดยืนยัน"
          : "ตั้งชื่อร้านและ PIN ก่อนเริ่มนับสิทธิ์ 30 วัน ร้านใหม่เริ่มจากข้อมูลว่าง"}
      </p>
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="full"
        disabled={busy || (!selected && !canCreate)}
      >
        {busy
          ? "กำลังดำเนินการ…"
          : selected
            ? "ยืนยันใช้สิทธิ์กับร้านนี้"
            : "ไปตั้งค่าร้าน"}
      </Button>
      <Link href="/start?switch=1">กลับไปเลือกร้านของคุณ</Link>
    </form>
  );
}
