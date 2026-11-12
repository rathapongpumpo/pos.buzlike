"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Store } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { PinPad } from "./ui/pin-pad";
type Draft = {
  requestKey: string;
  name: string;
  businessType: string;
  version: number;
  completedSlug: string | null;
};
export function Onboarding({
  initialDraft,
  selectedPlan,
  pilotEnrollmentId,
}: {
  initialDraft: Draft;
  selectedPlan?: string | null;
  pilotEnrollmentId?: string;
}) {
  const [draftStatus, setDraftStatus] = useState(
      initialDraft.name ? "โหลดข้อมูลที่บันทึกไว้แล้ว" : "",
    ),
    [completed, setCompleted] = useState<string | null>(
      initialDraft.completedSlug,
    );
  const key = useRef(initialDraft.requestKey),
    version = useRef(initialDraft.version),
    saves = useRef<Promise<unknown>>(Promise.resolve()),
    finished = useRef(!!initialDraft.completedSlug);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [form, setForm] = useState({
    name: initialDraft.name,
    businessType: initialDraft.businessType,
    pin: "",
  });
  const heading = useRef<HTMLHeadingElement>(null);
  function applyDraft(draft: Draft | null) {
    key.current = draft?.requestKey ?? crypto.randomUUID();
    version.current = draft?.version ?? 0;
    setForm({
      name: draft?.name ?? "",
      businessType: draft?.businessType ?? "CAFE_BEVERAGE",
      pin: "",
    });
    setCompleted(draft?.completedSlug ?? null);
    finished.current = !!draft?.completedSlug;
    setDraftStatus(draft?.name ? "โหลดข้อมูลที่บันทึกไว้แล้ว" : "");
  }
  function saveDraft(name: string, businessType: string) {
    const save = saves.current
      .catch(() => {})
      .then(async () => {
        if (finished.current) return;
        setDraftStatus("กำลังบันทึกข้อมูลร้าน…");
        const result = await api<{ draft: Draft }>(
          "/api/onboarding/draft",
          {
            requestKey: key.current,
            version: version.current,
            name,
            businessType,
          },
          "PUT",
        );
        version.current = result.draft.version;
        setDraftStatus("บันทึกข้อมูลร้านแล้ว");
      });
    saves.current = save;
    return save;
  }
  useEffect(() => {
    if (completed || finished.current) return;
    const timer = setTimeout(() => {
      void saveDraft(form.name, form.businessType).catch((e) => {
        setDraftStatus("");
        setError(e.message);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [completed, form.name, form.businessType]);
  const field = (k: keyof typeof form, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  const goToStep = (next: number) => {
    setError("");
    setStep(next);
    setConfirming(false);
    setConfirmPin("");
    focusHeading();
  };
  const activePin = confirming ? confirmPin : form.pin;
  const goBack = () => {
    if (busy) return;
    if (confirming) {
      setConfirming(false);
      setConfirmPin("");
      setError("");
      focusHeading();
    } else goToStep(0);
  };
  if (completed)
    return (
      <section className="auth-card">
        <h1>สร้างร้านแล้ว</h1>
        <p>คำขอตั้งร้านเดิมเสร็จแล้ว เปิดร้านเพื่อเพิ่มสินค้าได้เลย</p>
        <div className="account-actions">
          <Button asChild>
            <Link
              href={
                selectedPlan
                  ? `/${completed}/billing?plan=${selectedPlan}`
                  : `/${completed}/products`
              }
            >
              {selectedPlan ? "ดำเนินการแพ็กเกจต่อ" : "เปิดร้านที่สร้างแล้ว"}
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const r = await api<{ draft: Draft }>("/api/onboarding/draft", {
                  version: version.current,
                });
                applyDraft(r.draft);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            เริ่มตั้งร้านใหม่อีกหนึ่งร้าน
          </Button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <div
      className={`auth-card onboarding-card ${step === 1 ? "with-keypad" : ""}`}
    >
      <div className="onboarding-topline">
        {step === 0 ? (
          <Button asChild variant="ghost" className="auth-back">
            <Link href="/">
              <ArrowLeft size={18} />
              กลับหน้าแรก
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="auth-back"
            disabled={busy}
            onClick={goBack}
          >
            <ArrowLeft size={18} />
            ย้อนกลับ
          </Button>
        )}
      </div>
      <header className="onboarding-header">
        {pilotEnrollmentId && (
          <p className="notice">
            Pro นำร่องฟรี 30 วัน เริ่มนับหลังสร้างร้านสำเร็จ
          </p>
        )}
        <p className="onboarding-progress">
          ขั้นตอน {step + 1} จาก 2:{" "}
          {step === 0 ? "ตั้งค่าร้าน" : "ตั้งรหัส PIN สำหรับพนักงาน"}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {step === 0
            ? "ตั้งชื่อร้านของคุณ"
            : confirming
              ? "ยืนยัน PIN อีกครั้ง"
              : "ตั้งรหัส PIN สำหรับพนักงาน"}
        </h1>
        <p className="onboarding-next">
          {step === 0
            ? "ถัดไป: ตั้งรหัส PIN สำหรับพนักงาน"
            : confirming
              ? "กดรหัสเดิมอีกครั้ง แล้วกดสร้างร้านเพื่อเริ่มเพิ่มสินค้า"
              : "ใช้ระบุพนักงานที่กำลังขาย และสลับผู้ใช้งานบนเครื่องขาย"}
        </p>
      </header>
      <form
        className={step === 1 ? "onboarding-form pin-step" : "onboarding-form"}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (step === 0) {
            if (form.name.trim().length < 2) {
              setError("กรุณากรอกชื่อร้านอย่างน้อย 2 ตัวอักษร");
              return;
            }
            setBusy(true);
            try {
              await saveDraft(form.name, form.businessType);
              goToStep(1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
            return;
          }
          if (!/^[0-9]{4,6}$/.test(activePin)) {
            setError("กรุณากด PIN ตัวเลข 4–6 หลัก");
            return;
          }
          if (!confirming) {
            setConfirming(true);
            setConfirmPin("");
            focusHeading();
            return;
          }
          if (confirmPin !== form.pin) {
            setError("PIN ทั้งสองครั้งไม่ตรงกัน กรุณาลองอีกครั้ง");
            return;
          }
          setBusy(true);
          try {
            await saveDraft(form.name, form.businessType);
            const r = await api<{ slug: string }>("/api/onboarding", {
              requestKey: key.current,
              ...(pilotEnrollmentId ? { pilotEnrollmentId } : {}),
              ...form,
              confirmPin,
              name: form.name.trim(),
            });
            finished.current = true;
            window.location.href = selectedPlan
              ? `/${r.slug}/billing?plan=${selectedPlan}`
              : `/${r.slug}/products`;
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        {step === 0 ? (
          <>
            <label className="field">
              ชื่อร้านค้า
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="organization"
                placeholder="เช่น ร้านบ้านกาแฟ"
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
              />
              <small>ชื่อที่แสดงบนหน้าขายและใบเสร็จ เปลี่ยนภายหลังได้</small>
            </label>
            <label className="field">
              ประเภทธุรกิจ
              <select
                value={form.businessType}
                onChange={(e) => field("businessType", e.target.value)}
              >
                <option value="CAFE_BEVERAGE">คาเฟ่ / ร้านเครื่องดื่ม</option>
                <option value="RESTAURANT">ร้านอาหาร</option>
                <option value="RETAIL_SHOP">ร้านค้าปลีก</option>
              </select>
            </label>
            <p className="notice">
              ระบบสร้างลิงก์ร้านให้เอง เข้าสู่ระบบด้วยบัญชีของคุณได้เลย
            </p>
            <p className="draft-status" role="status">
              {draftStatus}
            </p>
          </>
        ) : (
          <>
            <div className="pin-context">
              <h2 className="setup-summary-heading">ร้านของคุณ</h2>
              <div className="setup-shop">
                <Store size={20} aria-hidden="true" />
                <strong>{form.name.trim()}</strong>
              </div>
              <p className="pin-explanation">
                {confirming
                  ? "กด PIN เดิมอีกครั้งเพื่อป้องกันการกดผิด"
                  : "กดตัวเลขเพื่อตั้ง PIN สำหรับสลับพนักงานที่หน้าขาย"}
              </p>
              <div className="setup-note">
                <ShieldCheck size={20} aria-hidden="true" />
                <p>ใช้ PIN สลับพนักงานที่หน้าขาย แยกจากรหัสผ่านเข้าสู่ระบบ</p>
              </div>
              <p className="setup-later">
                ร้านเริ่มจากข้อมูลเปล่า พร้อมเพย์และภาษีตั้งภายหลังได้
              </p>
            </div>
            <div className="pin-entry">
              <PinPad
                key={confirming ? "confirmation" : "creation"}
                value={activePin}
                name={confirming ? "confirmPin" : "pin"}
                label={confirming ? "ยืนยัน PIN หน้าขาย" : "ตั้ง PIN หน้าขาย"}
                disabled={busy}
                onChange={(value) => {
                  setError("");
                  confirming ? setConfirmPin(value) : field("pin", value);
                }}
              />
              {error && (
                <p className="error pin-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </>
        )}
        {step === 0 && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {error && (
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            โหลดข้อมูลที่บันทึกล่าสุด
          </Button>
        )}
        <div className="onboarding-actions">
          <Button
            className="full"
            type="submit"
            disabled={busy || (step === 1 && activePin.length < 4)}
          >
            {busy
              ? "กำลังสร้างร้าน…"
              : step === 0
                ? "ถัดไป: ตั้งรหัส PIN"
                : confirming
                  ? "สร้างร้าน"
                  : "ยืนยัน PIN"}
          </Button>
        </div>
      </form>
    </div>
  );
}
