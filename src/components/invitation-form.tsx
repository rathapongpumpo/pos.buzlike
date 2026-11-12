"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { PinPad } from "./ui/pin-pad";
import { AccountSignOut } from "./account-controls";
export function InvitationForm({
  token,
  account,
}: {
  token: string;
  account: { userId: string; email: string; needsVerification: boolean } | null;
}) {
  const [invite, setInvite] = useState<{
      email: string;
      storeName: string;
      displayName: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pin, setPin] = useState(""),
    [confirmPin, setConfirmPin] = useState(""),
    [confirming, setConfirming] = useState(false);
  const next = `/invite?token=${token}`;
  useEffect(() => {
    let active = true;
    api<typeof invite>("/api/invitations/preview", { token })
      .then((r) => {
        if (active) setInvite(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <section className="auth-card">
      <Link href="/" className="auth-back">
        ← กลับหน้าแรก
      </Link>
      <h1>{invite ? `เข้าร่วมร้าน ${invite.storeName}` : "คำเชิญเข้าร้าน"}</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!invite ? (
        <p>
          {error
            ? "ขอให้เจ้าของร้านส่งคำเชิญใหม่ได้จากหน้าพนักงาน"
            : "กำลังตรวจคำเชิญ…"}
        </p>
      ) : (
        <>
          <p>
            คำเชิญสำหรับ {invite.email} · ชื่อในร้าน: {invite.displayName}
          </p>
          {!account ? (
            <div className="account-actions">
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(next)}`}>
                  เข้าสู่ระบบเพื่อรับคำเชิญ
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/register?next=${encodeURIComponent(next)}`}>
                  สมัครด้วยอีเมลที่ได้รับเชิญ
                </Link>
              </Button>
            </div>
          ) : account.email !== invite.email ? (
            <>
              <p className="notice">
                บัญชีที่เข้าอยู่คือ {account.email} กรุณาออกจากระบบ
                แล้วเข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ
              </p>
              <AccountSignOut userId={account.userId} />
            </>
          ) : account.needsVerification ? (
            <Button asChild>
              <Link href={`/verify-email?next=${encodeURIComponent(next)}`}>
                ยืนยันอีเมลก่อนรับคำเชิญ
              </Link>
            </Button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setError("");
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                if (pin !== confirmPin) {
                  setError("PIN ทั้งสองครั้งไม่ตรงกัน");
                  return;
                }
                setBusy(true);
                try {
                  const result = await api<{ slug: string }>(
                    "/api/invitations/accept",
                    { token, pin, confirmPin },
                  );
                  window.location.href = `/${result.slug}/start`;
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <p>
                {confirming
                  ? "กด PIN เดิมอีกครั้งเพื่อยืนยัน"
                  : "ตั้ง PIN ของคุณสำหรับสลับพนักงานที่หน้าขาย"}
              </p>
              <PinPad
                value={confirming ? confirmPin : pin}
                onChange={confirming ? setConfirmPin : setPin}
                label={confirming ? "ยืนยัน PIN ของคุณ" : "ตั้ง PIN ของคุณ"}
                disabled={busy}
              />
              <div className="account-actions">
                {confirming && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(false);
                      setConfirmPin("");
                    }}
                  >
                    ย้อนกลับ
                  </Button>
                )}
                <Button
                  disabled={busy || (confirming ? confirmPin : pin).length < 4}
                >
                  {busy
                    ? "กำลังเข้าร่วม…"
                    : confirming
                      ? "ยอมรับคำเชิญและเข้าร้าน"
                      : "ถัดไป: ยืนยัน PIN"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
