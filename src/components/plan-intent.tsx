"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
export function PlanIntent({ plan }: { plan: string | null }) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!plan) return;
    let active = true;
    // Client mount only: Link prefetch/render must never change a customer's choice.
    api("/api/billing/intent", { plan }, "PUT").catch(() => {
      if (active)
        setError("ยังบันทึกแพ็กเกจข้ามอุปกรณ์ไม่ได้ กรุณาลองโหลดหน้าอีกครั้ง");
    });
    return () => {
      active = false;
    };
  }, [plan]);
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : null;
}
