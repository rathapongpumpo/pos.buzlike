"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { safeNext, planFromNext } from "@/lib/account-links";
export function AuthForm({
  register = false,
  google = false,
  next = "/start",
  authError,
  pilotMode = false,
  pilotInvite = false,
  inviteEmail,
}: {
  register?: boolean;
  google?: boolean;
  next?: string;
  authError?: string;
  pilotMode?: boolean;
  pilotInvite?: boolean;
  inviteEmail?: string;
}) {
  const linkRequired = [
    "GoogleLinkRequired",
    "GoogleLinkInvalid",
    "GoogleIdentityConflict",
  ].includes(authError ?? "");
  const [error, setError] = useState(
    authError === "GoogleLinkRequired"
      ? "อีเมลนี้มีบัญชีอยู่แล้ว ยืนยันรหัสผ่านเดิมเพื่อเชื่อม Google แล้วใช้ร้านเดิมได้เลย"
      : authError === "GoogleLinkInvalid"
        ? "การเชื่อมบัญชีหมดอายุหรือเลือกอีเมลไม่ตรงกัน กรุณายืนยันรหัสผ่านแล้วเลือก Google อีเมลเดียวกันอีกครั้ง"
        : authError === "GoogleIdentityConflict"
          ? "บัญชีนี้เชื่อมกับ Google อื่นอยู่แล้ว กรุณาใช้บัญชี Google ที่เคยเชื่อมไว้ หรือเข้าสู่ระบบด้วยรหัสผ่าน"
          : authError
            ? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง หรือใช้อีเมลและรหัสผ่าน"
            : "",
  );
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const confirmation = useRef<HTMLInputElement>(null);
  const mismatch = register && confirmTouched && password !== confirmPassword;
  const plan = planFromNext(next);
  return (
    <div className="auth-card auth-entry-card">
      <header className="auth-entry-heading">
        <h1>{register ? "สร้างบัญชีของคุณ" : "เข้าสู่ระบบ"}</h1>
        {register ? (
          <p className="auth-entry-benefits">
            <span>
              {pilotMode
                ? pilotInvite
                  ? "Pro นำร่องฟรี 30 วัน"
                  : "ลงทะเบียนรอเปิดบริการ"
                : "ทดลองใช้ฟรี 14 วัน"}
            </span>
            <span>
              {pilotMode && !pilotInvite
                ? "ไม่มีค่าใช้จ่าย"
                : "ไม่ต้องใช้บัตรเครดิต"}
            </span>
          </p>
        ) : (
          <p>จัดการร้านและเริ่มขายได้เลย</p>
        )}
      </header>
      {plan && (
        <p className="notice auth-selected-plan">
          แพ็กเกจที่เลือก:{" "}
          {plan.startsWith("STARTER")
            ? "Starter"
            : plan.startsWith("PRO")
              ? "Pro"
              : "Lifetime"}{" "}
          ·{" "}
          {plan.includes("YEARLY")
            ? "รายปี"
            : plan.includes("MONTHLY")
              ? "รายเดือน"
              : "ซื้อขาด"}
          <br />
          ตรวจสอบยอดชำระได้หลังตั้งร้าน
        </p>
      )}
      <form
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (register && password !== confirmPassword) {
            setConfirmTouched(true);
            confirmation.current?.focus();
            return;
          }
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const email = String(f.get("email")).trim().toLowerCase();
          try {
            if (linkRequired && google && !register) {
              await api("/api/auth/google-link", { email, password });
              await signIn("google", { redirectTo: safeNext(next) });
              return;
            }
            if (register && !accountCreated) {
              await api("/api/auth/register", {
                email,
                password,
                confirmPassword,
                next: safeNext(next),
              });
              setAccountCreated(true);
            }
            const res = await signIn("credentials", {
              email,
              password,
              redirect: false,
            });
            if (!res || res.error || !res.ok)
              throw new Error(
                register
                  ? "สร้างบัญชีแล้ว แต่ยังเข้าสู่ระบบไม่ได้ กรุณาลองเข้าสู่ระบบอีกครั้งด้วยอีเมลและรหัสผ่านเดิม"
                  : "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
              );
            window.location.href = register
              ? `/verify-email?next=${encodeURIComponent(safeNext(next))}`
              : safeNext(next);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="field">
          อีเมล
          <input
            name="email"
            defaultValue={inviteEmail}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            readOnly={busy || accountCreated}
          />
        </label>
        <div className="field">
          <div className="auth-field-heading">
            <label htmlFor="auth-password">รหัสผ่าน</label>
            {register && (
              <small id="password-hint">อย่างน้อย 10 ตัวอักษร</small>
            )}
          </div>
          <div className="auth-password-control">
            <input
              id="auth-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 10 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={busy}
              aria-describedby={register ? "password-hint" : undefined}
            />
            <button
              type="button"
              className="auth-password-toggle"
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} aria-hidden="true" />
              ) : (
                <Eye size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {register && (
          <div className="field">
            <label htmlFor="auth-confirm-password">ยืนยันรหัสผ่าน</label>
            <div className="auth-password-control">
              <input
                id="auth-confirm-password"
                ref={confirmation}
                name="confirmPassword"
                type={showConfirmation ? "text" : "password"}
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                readOnly={busy}
                aria-invalid={mismatch}
                aria-describedby="confirm-password-feedback"
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={
                  showConfirmation ? "ซ่อนรหัสผ่านยืนยัน" : "แสดงรหัสผ่านยืนยัน"
                }
                aria-pressed={showConfirmation}
                onClick={() => setShowConfirmation(!showConfirmation)}
              >
                {showConfirmation ? (
                  <EyeOff size={20} aria-hidden="true" />
                ) : (
                  <Eye size={20} aria-hidden="true" />
                )}
              </button>
            </div>
            <small
              id="confirm-password-feedback"
              className={`auth-confirm-feedback ${mismatch ? "error" : "muted"}`}
              role={mismatch ? "alert" : undefined}
            >
              {mismatch
                ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน"
                : "กรอกซ้ำให้ตรงกับรหัสผ่านด้านบน"}
            </small>
          </div>
        )}
        {!register && (
          <div className="auth-form-links">
            <Link href="/forgot-password">ลืมรหัสผ่าน?</Link>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button className="auth-submit" disabled={busy} type="submit">
          {busy
            ? "กำลังดำเนินการ…"
            : linkRequired && google && !register
              ? "ยืนยันรหัสผ่านและเชื่อม Google"
              : accountCreated
                ? "เข้าสู่ระบบและตั้งร้าน"
                : register
                  ? "สร้างบัญชี"
                  : "เข้าสู่ระบบ"}
          <ArrowRight size={18} />
        </Button>
      </form>
      {linkRequired && google && !register && (
        <Button
          type="button"
          variant="ghost"
          className="full"
          disabled={busy}
          onClick={() =>
            (window.location.href = `/login?next=${encodeURIComponent(safeNext(next))}`)
          }
        >
          ใช้อีเมลและรหัสผ่านตามปกติ
        </Button>
      )}
      <div className="auth-divider">
        <span>หรือ</span>
      </div>
      <div className="google-auth">
        <Button
          type="button"
          variant="outline"
          className="full"
          disabled={busy || !google}
          aria-describedby={!google ? "google-availability" : undefined}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              await signIn("google", { redirectTo: safeNext(next) });
            } catch {
              setError("เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองอีกครั้ง");
              setBusy(false);
            }
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.75 3.28-7.95Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.83 13.95a6.6 6.6 0 0 1 0-3.9V7.21H2.15a11 11 0 0 0 0 9.58l3.68-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.5c1.62 0 3.07.56 4.21 1.65l3.16-3.16A10.57 10.57 0 0 0 12 1a11 11 0 0 0-9.85 6.21l3.68 2.84C6.7 7.44 9.13 5.5 12 5.5Z"
            />
          </svg>
          {busy
            ? "กำลังดำเนินการ…"
            : register
              ? "สมัครด้วย Google"
              : "ลงชื่อเข้าใช้ด้วย Google"}
        </Button>
        {!google && (
          <small id="google-availability" className="muted">
            Google จะเปิดให้ใช้งานเร็ว ๆ นี้
          </small>
        )}
      </div>
      <footer>
        <span>{register ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"}</span>
        <Link
          href={`${register ? "/login" : "/register"}?next=${encodeURIComponent(safeNext(next))}`}
        >
          {register
            ? "เข้าสู่ระบบ"
            : pilotMode
              ? "สร้างบัญชี"
              : "ทดลองใช้งานฟรี"}
        </Link>
      </footer>
      {register && (
        <p className="auth-policy-links">
          อ่าน <Link href="/terms">ข้อกำหนดนำร่อง</Link> และ{" "}
          <Link href="/privacy">ความเป็นส่วนตัว</Link> ·{" "}
          <Link href="/support">ติดต่อทีม</Link>
        </p>
      )}
    </div>
  );
}
