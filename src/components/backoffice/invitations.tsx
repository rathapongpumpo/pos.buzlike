"use client";
import { useEffect, useState } from "react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { FormModal, fString } from "./shared";
import { api } from "@/lib/client-api";
type Invite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  staff: { displayName: string };
};
export function Invitations() {
  const { data, slug, notify, refresh } = useStore();
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Invite[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const result = await api<{ invitations: Invite[] }>(
      `/api/invitations/list?storeSlug=${encodeURIComponent(slug)}&branchId=${data.branch.id}`,
    );
    setRows(result.invitations);
  }
  useEffect(() => {
    let active = true;
    api<{ invitations: Invite[] }>(
      `/api/invitations/list?storeSlug=${encodeURIComponent(slug)}&branchId=${data.branch.id}`,
    )
      .then((r) => {
        if (active) setRows(r.invitations);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug, data.branch.id]);
  return (
    <section className="panel section-space">
      <h2>เชิญพนักงานให้มีบัญชีของตัวเอง</h2>
      <p>
        พนักงานใช้อีเมลและรหัสผ่านของตนเอง เข้าได้เฉพาะสาขาที่คุณอนุญาต
        คำเชิญใช้ได้ 72 ชั่วโมง
      </p>
      <Button onClick={() => setOpen(true)}>เชิญทางอีเมล</Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="invite-list section-space">
        {rows.map((invite) => (
          <article className="invite-row" key={invite.id}>
            <strong>{invite.staff.displayName}</strong>
            <div>{invite.email}</div>
            <small>
              {invite.acceptedAt
                ? "เข้าร่วมแล้ว"
                : invite.revokedAt
                  ? "ยกเลิกแล้ว"
                  : new Date(invite.expiresAt) < new Date()
                    ? "หมดอายุ"
                    : "รอตอบรับ"}
            </small>
            {!invite.acceptedAt && (
              <div className="row">
                {["resend", "revoke"]
                  .filter((action) => action !== "revoke" || !invite.revokedAt)
                  .map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api(`/api/invitations/${action}`, {
                            storeSlug: slug,
                            branchId: data.branch.id,
                            id: invite.id,
                          });
                          await load();
                          notify(
                            action === "resend"
                              ? "เข้าคิวส่งคำเชิญใหม่แล้ว"
                              : "ยกเลิกคำเชิญแล้ว",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {action === "resend" ? "ส่งคำเชิญใหม่" : "ยกเลิกคำเชิญ"}
                    </Button>
                  ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {open && (
        <FormModal
          title="เชิญพนักงานทางอีเมล"
          submit="ส่งคำเชิญ"
          onClose={() => setOpen(false)}
          onSubmit={async (f) => {
            await api("/api/invitations/create", {
              storeSlug: slug,
              branchId: data.branch.id,
              email: fString(f, "email"),
              displayName: fString(f, "displayName"),
              role: fString(f, "role"),
              branchIds: f.getAll("branchIds").map(String),
            });
            await load();
            await refresh();
            notify("เข้าคิวส่งคำเชิญแล้ว");
          }}
        >
          <label className="field">
            อีเมลพนักงาน
            <input
              name="email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
            />
          </label>
          <label className="field">
            ชื่อแสดงในร้าน
            <input name="displayName" required maxLength={120} />
          </label>
          <label className="field">
            สิทธิ์
            <select name="role" defaultValue="CASHIER">
              <option value="MANAGER">ผู้จัดการ</option>
              <option value="CASHIER">แคชเชียร์</option>
              <option value="KITCHEN">ครัว</option>
              <option value="WAITER">พนักงานเสิร์ฟ</option>
            </select>
          </label>
          <fieldset className="branch-grants">
            <legend>สาขาที่อนุญาตให้ทำงาน</legend>
            {data.branches.map((branch) => (
              <label className="check" key={branch.id}>
                <input
                  type="checkbox"
                  name="branchIds"
                  value={branch.id}
                  defaultChecked={branch.id === data.branch.id}
                />
                {branch.name}
              </label>
            ))}
          </fieldset>
          <p className="notice">
            พนักงานจะตั้ง PIN ด้วยตัวเองตอนรับคำเชิญ คุณไม่ต้องตั้งรหัสผ่านให้
          </p>
        </FormModal>
      )}
    </section>
  );
}
