"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { safeNext } from "@/lib/account-links";
import { Button } from "./ui/button";
export function AccountRecovery({
  mode,
  token = "",
  next = "/start",
  email = "",
  signedIn = false,
}: {
  mode: "verify" | "forgot" | "reset";
  token?: string;
  next?: string;
  email?: string;
  signedIn?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false),
    [show, setShow] = useState(false);
  const title =
    mode === "forgot"
      ? "ลืมรหัสผ่าน"
      : mode === "reset"
        ? "ตั้งรหัสผ่านใหม่"
        : "ยืนยันอีเมลของคุณ";
  async function submit(body: object, action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(
        `/api/account/${action}`,
        body,
      );
      setMessage(result.message);
      if (action === "verify-email" || action === "reset-password")
        setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card recovery-card">
      <Link href="/login" className="auth-back">
        ← กลับเข้าสู่ระบบ
      </Link>
      <h1>{title}</h1>
      <p>
        {mode === "forgot"
          ? "กรอกอีเมลที่สมัครไว้ เราจะส่งลิงก์ให้ตั้งรหัสผ่านใหม่"
          : mode === "reset"
            ? "ใช้อย่างน้อย 10 ตัวอักษร หลังบันทึกทุกเครื่องต้องเข้าสู่ระบบใหม่"
            : token
              ? "กดปุ่มด้านล่างเพื่อยืนยันอีเมล ลิงก์ใช้ได้ครั้งเดียว"
              : `เปิดอีเมล ${email || "ที่สมัคร"} เพื่อกดลิงก์ยืนยัน ตรวจกล่องจดหมายและสแปม ลิงก์ใช้ได้ 24 ชั่วโมง`}
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done ? (
        <Button asChild className="full">
          <Link
            href={
              mode === "verify" && signedIn
                ? safeNext(next)
                : `/login?next=${encodeURIComponent(safeNext(next))}`
            }
          >
            {mode === "verify" && signedIn ? "ดำเนินการต่อ" : "เข้าสู่ระบบ"}
          </Link>
        </Button>
      ) : mode === "verify" ? (
        <div className="account-actions">
          {token && (
            <Button
              disabled={busy}
              onClick={() => void submit({ token }, "verify-email")}
            >
              {busy ? "กำลังยืนยัน…" : "ยืนยันอีเมล"}
            </Button>
          )}
          {signedIn ? (
            <Button
              variant={token ? "outline" : "default"}
              disabled={busy}
              onClick={() =>
                void submit({ next: safeNext(next) }, "resend-verification")
              }
            >
              {busy ? "กำลังส่ง…" : "ส่งอีเมลยืนยันอีกครั้ง"}
            </Button>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(safeNext(next))}`}>
              เข้าสู่ระบบเพื่อขอลิงก์ใหม่
            </Link>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (mode === "forgot")
              void submit({ email: String(f.get("email")) }, "forgot-password");
            else if (f.get("password") !== f.get("confirmPassword"))
              setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
            else
              void submit(
                {
                  token,
                  password: f.get("password"),
                  confirmPassword: f.get("confirmPassword"),
                },
                "reset-password",
              );
          }}
        >
          {mode === "forgot" ? (
            <label className="field">
              อีเมล
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                readOnly={busy}
              />
            </label>
          ) : (
            <>
              <label className="field">
                รหัสผ่านใหม่
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  readOnly={busy}
                />
              </label>
              <label className="field">
                ยืนยันรหัสผ่านใหม่
                <input
                  name="confirmPassword"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  readOnly={busy}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={(e) => setShow(e.target.checked)}
                />
                แสดงรหัสผ่าน
              </label>
            </>
          )}
          <Button className="full" disabled={busy}>
            {busy
              ? "กำลังดำเนินการ…"
              : mode === "forgot"
                ? "ส่งลิงก์ตั้งรหัสผ่านใหม่"
                : "บันทึกรหัสผ่านใหม่"}
          </Button>
        </form>
      )}
      {mode === "reset" && !done && (
        <p>
          <Link href="/forgot-password">ลิงก์หมดอายุ? ขอลิงก์ใหม่</Link>
        </p>
      )}
    </section>
  );
}
