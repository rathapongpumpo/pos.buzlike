"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { pilotDate, pilotLabels } from "@/lib/pilot-labels";
import { Button } from "./ui/button";
import { FormModal, fString } from "./backoffice/shared";
type Invitation = {
  id: string;
  normalizedEmail: string;
  tokenVersion: number;
  expiresAt: string;
  revokedAt: string | null;
  claimedAt: string | null;
};
type Grant = {
  id: string;
  version: number;
  status: string;
  endsAt: string | null;
  activatedAt: string | null;
  owner: { email: string };
  tenant: {
    name: string;
    slug: string;
    branches: {
      _count: { orders: number; shifts: number };
      orders: { createdAt: string }[];
    }[];
  } | null;
};
type Campaign = {
  id: string;
  slug: string;
  version: number;
  status: string;
  capacity: number;
  durationDays: number;
  invitations: Invitation[];
  enrollments: Grant[];
  auditEvents: {
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    actor: { email: string } | null;
  }[];
};
type Data = {
  campaigns: Campaign[];
  waiting: number;
  pendingMail: number;
  failedMail: number;
  feedbackOpen: number;
};
type Edit = {
  action:
    "invite" | "resend" | "revokeInvitation" | "extend" | "revoke" | "campaign";
  campaign: Campaign;
  grant?: Grant;
  invitation?: Invitation;
  key: string;
};
const actionLabels = {
  invite: "ส่งคำเชิญ",
  resend: "ส่งคำเชิญใหม่",
  revokeInvitation: "ถอนคำเชิญ",
  extend: "ขยายวันใช้งาน",
  revoke: "ถอนสิทธิ์ร้าน",
  campaign: "เปลี่ยนสถานะโครงการ",
};
export function AdminPilot() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [edit, setEdit] = useState<Edit | null>(null);
  const refresh = useCallback(async () => {
    try {
      setData(await api<Data>("/api/admin/pilot"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const open = (action: Edit["action"], campaign: Campaign, values = {}) =>
    setEdit({ action, campaign, key: crypto.randomUUID(), ...values });
  return (
    <section className="pilot-workspace">
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
      <p className="pilot-meta">
        คำเชิญส่งผ่านคิวอีเมล ต้องรัน email worker จึงจะส่งออก
        การถอนร้านที่เริ่มใช้แล้วจะไม่คืนโควตานำร่อง
      </p>
      <Button variant="outline" onClick={() => void refresh()}>
        โหลดข้อมูลล่าสุด
      </Button>
      {!data ? (
        <p role="status">กำลังโหลด…</p>
      ) : (
        <>
          <div className="pilot-metrics">
            {[
              ["ผู้ลงทะเบียนรอ", data.waiting],
              ["เรื่องที่ยังไม่จบ", data.feedbackOpen],
              ["อีเมลรอส่ง", data.pendingMail],
              ["อีเมลส่งไม่สำเร็จ", data.failedMail],
            ].map(([k, v]) => (
              <div className="pilot-panel" key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {data.campaigns.map((c) => (
            <div className="pilot-panel" key={c.id}>
              <div className="pilot-item-heading">
                <div>
                  <h2>{c.slug}</h2>
                  <p className="pilot-meta">
                    {c.capacity} สิทธิ์ · Pro {c.durationDays} วัน ·{" "}
                    {pilotLabels[c.status]}
                  </p>
                </div>
                <div className="pilot-actions">
                  <Button variant="outline" onClick={() => open("campaign", c)}>
                    สถานะโครงการ
                  </Button>
                  <Button
                    disabled={c.status !== "OPEN"}
                    onClick={() => open("invite", c)}
                  >
                    ส่งคำเชิญ
                  </Button>
                </div>
              </div>
              <h3>คำเชิญ ({c.invitations.length})</h3>
              {!c.invitations.length && (
                <p className="pilot-empty">
                  ยังไม่มีคำเชิญ เปิดโครงการเมื่อพร้อมรับร้านนำร่อง
                </p>
              )}
              <div className="pilot-list">
                {c.invitations.map((i) => (
                  <article className="pilot-item" key={i.id}>
                    <strong className="pilot-break">{i.normalizedEmail}</strong>
                    <p className="pilot-meta">
                      {i.revokedAt
                        ? "ถอนคำเชิญแล้ว"
                        : i.claimedAt
                          ? "รับคำเชิญแล้ว"
                          : new Date(i.expiresAt) <= new Date()
                            ? "ลิงก์หมดอายุ"
                            : "รอรับคำเชิญ"}{" "}
                      · หมดอายุ {pilotDate(i.expiresAt)}
                    </p>
                    <div className="pilot-actions">
                      <Button
                        variant="outline"
                        disabled={
                          !!i.revokedAt ||
                          c.status !== "OPEN" ||
                          c.enrollments.some(
                            (g) =>
                              g.activatedAt &&
                              g.owner.email === i.normalizedEmail,
                          )
                        }
                        onClick={() => open("resend", c, { invitation: i })}
                      >
                        ส่งใหม่
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          !!i.revokedAt ||
                          c.enrollments.some(
                            (g) =>
                              g.activatedAt &&
                              g.owner.email === i.normalizedEmail,
                          )
                        }
                        onClick={() =>
                          open("revokeInvitation", c, { invitation: i })
                        }
                      >
                        ถอนคำเชิญ
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <h3>ร้านและการจอง ({c.enrollments.length})</h3>
              <div className="pilot-list">
                {c.enrollments.map((g) => (
                  <article className="pilot-item" key={g.id}>
                    <div className="pilot-item-heading">
                      <strong>{g.tenant?.name ?? g.owner.email}</strong>
                      <span className="pilot-status">
                        {pilotLabels[g.status]}
                      </span>
                    </div>
                    <p className="pilot-meta">
                      สิ้นสุด {pilotDate(g.endsAt)}
                      {g.tenant &&
                        ` · ${g.tenant.branches.length} สาขา · ${g.tenant.branches.reduce((sum, b) => sum + b._count.orders, 0)} รายการขายทั้งหมด`}
                    </p>
                    <div className="pilot-actions">
                      <Button
                        variant="outline"
                        disabled={!["ACTIVE", "EXPIRED"].includes(g.status)}
                        onClick={() => open("extend", c, { grant: g })}
                      >
                        ขยายวัน
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!["ACTIVE", "EXPIRED"].includes(g.status)}
                        onClick={() => open("revoke", c, { grant: g })}
                      >
                        ถอนสิทธิ์
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <details>
                <summary>ประวัติจัดการล่าสุด ({c.auditEvents.length})</summary>
                <ol className="pilot-timeline">
                  {c.auditEvents.map((a) => (
                    <li key={a.id}>
                      <strong>{a.action}</strong>
                      <p className="pilot-message">{a.reason}</p>
                      <small className="pilot-break">
                        {a.actor?.email ?? "ระบบ"} · {pilotDate(a.createdAt)}
                      </small>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          ))}
        </>
      )}
      {edit && (
        <FormModal
          title={actionLabels[edit.action]}
          onClose={() => setEdit(null)}
          submit={actionLabels[edit.action]}
          onSubmit={async (f) => {
            const body =
              edit.action === "campaign"
                ? {
                    action: edit.action,
                    id: edit.campaign.id,
                    version: edit.campaign.version,
                    status: fString(f, "status"),
                    reason: fString(f, "reason"),
                  }
                : {
                    action: edit.action,
                    campaignId: edit.campaign.id,
                    id: edit.grant?.id ?? edit.invitation?.id,
                    version:
                      edit.grant?.version ?? edit.invitation?.tokenVersion,
                    reason: fString(f, "reason"),
                    ...(edit.action === "invite"
                      ? { email: fString(f, "email"), requestKey: edit.key }
                      : {}),
                    ...(edit.action === "extend"
                      ? {
                          endsAt: new Date(
                            `${fString(f, "endsAt")}T23:59:59+07:00`,
                          ).toISOString(),
                        }
                      : {}),
                  };
            await api("/api/admin/pilot", body);
            setSuccess(
              edit.action === "invite" || edit.action === "resend"
                ? "บันทึกคำเชิญเข้าคิวแล้ว ตรวจสถานะการส่งได้ที่ภาพรวม"
                : "บันทึกการเปลี่ยนแปลงแล้ว",
            );
            await refresh();
          }}
        >
          <p className="notice">
            {edit.action === "resend"
              ? "ลิงก์และการจองเดิมจะยกเลิก ผู้รับต้องรับสิทธิ์จากลิงก์ใหม่อีกครั้ง"
              : edit.action === "revoke"
                ? "ร้านจะหยุดใช้สิทธิ์นำร่องทันที ข้อมูลเดิมยังอยู่ และไม่คืนโควตาให้ร้านอื่น"
                : edit.action === "campaign"
                  ? "สถานะเปิดรับมีผลต่อการรับสิทธิ์ใหม่ การพักหรือปิดรับไม่ตัดสิทธิ์ร้านที่เริ่มใช้แล้ว"
                  : "กรุณาตรวจข้อมูลก่อนบันทึก"}
          </p>
          {edit.action === "invite" && (
            <label className="field">
              อีเมลผู้ได้รับเชิญ
              <input name="email" type="email" maxLength={254} required />
            </label>
          )}
          {edit.action === "campaign" ? (
            <label className="field">
              สถานะ
              <select
                name="status"
                defaultValue={
                  edit.campaign.status === "DRAFT"
                    ? "PAUSED"
                    : edit.campaign.status
                }
              >
                {["OPEN", "PAUSED", "CLOSED"].map((k) => (
                  <option key={k} value={k}>
                    {pilotLabels[k]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              {edit.action === "extend" && (
                <label className="field">
                  วันสิ้นสุดใหม่ (เวลาประเทศไทย)
                  <input name="endsAt" type="date" required />
                  <small>หลังวันเดิมและไม่เกิน 90 วันนับจากวันนี้</small>
                </label>
              )}
              <label className="field">
                เหตุผล
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={500}
                  required
                  rows={3}
                />
              </label>
            </>
          )}
          {edit.action === "campaign" && (
            <label className="field">
              เหตุผล
              <textarea
                name="reason"
                minLength={5}
                maxLength={500}
                required
                rows={3}
              />
            </label>
          )}
        </FormModal>
      )}
    </section>
  );
}
