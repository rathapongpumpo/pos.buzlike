"use client";
import { useState } from "react";
import { Plus, Pencil, ShieldCheck } from "lucide-react";
import { useStore } from "../store-context";
import { Button } from "../ui/button";
import { PinPad } from "../ui/pin-pad";
import { PageTitle, FormModal, fString } from "./shared";
import type { Bootstrap } from "@/lib/view-types";
import { Invitations } from "./invitations";
const roleLabel: Record<string, string> = {
  OWNER: "เจ้าของร้าน",
  MANAGER: "ผู้จัดการ",
  CASHIER: "แคชเชียร์",
  KITCHEN: "ครัว",
  WAITER: "พนักงานเสิร์ฟ",
};
export function Staff() {
  const { data, action, notify } = useStore();
  const [edit, setEdit] = useState<
    Bootstrap["staffList"][number] | "new" | null
  >(null);
  const [staffPin, setStaffPin] = useState("");
  const [changePin, setChangePin] = useState(false);
  const target = edit && edit !== "new" ? edit : null;
  return (
    <>
      <PageTitle
        title="พนักงานและสิทธิ์"
        description={`พนักงานสาขา ${data.branch.name} · โควตาทั้งร้าน ${data.tenant.maxStaff < 0 ? "ไม่จำกัด" : data.tenant.maxStaff}`}
      >
        <Button
          onClick={() => {
            setStaffPin("");
            setChangePin(false);
            setEdit("new");
          }}
        >
          <Plus size={17} />
          เพิ่มพนักงาน
        </Button>
      </PageTitle>
      <div className="panel table-scroll" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>พนักงาน</th>
              <th>สิทธิ์</th>
              <th>สาขาที่มีสิทธิ์</th>
              <th>สถานะ</th>
              <th>การเข้าใช้งาน</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.staffList.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="row">
                    <span className="avatar">{s.displayName[0]}</span>
                    <strong>{s.displayName}</strong>
                  </div>
                </td>
                <td>{roleLabel[s.role]}</td>
                <td>
                  {s.role === "OWNER"
                    ? "ทุกสาขา"
                    : s.branchIds
                        .map(
                          (id) =>
                            data.branches.find((branch) => branch.id === id)
                              ?.name,
                        )
                        .filter(Boolean)
                        .join(", ")}
                </td>
                <td>
                  <span className={`pill ${s.isActive ? "" : "gray"}`}>
                    {s.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td>
                  <span className="row muted">
                    <ShieldCheck size={17} />
                    PIN 4–6 หลัก
                  </span>
                </td>
                <td>
                  {s.role !== "OWNER" && (
                    <button
                      className="icon-button"
                      aria-label={`แก้ไข ${s.displayName}`}
                      onClick={() => {
                        setStaffPin("");
                        setChangePin(false);
                        setEdit(s);
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="notice section-space">
        พนักงานสลับชื่อด้วย PIN บนเครื่องที่เจ้าของร้านเข้าสู่ระบบแล้ว
        สิทธิ์จะเปลี่ยนตามผู้ปฏิบัติงานทันที
      </p>
      {data.staff.role === "OWNER" && <Invitations />}
      {edit && (
        <FormModal
          title={target ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}
          onClose={() => setEdit(null)}
          submitDisabled={(!target || changePin) && staffPin.length < 4}
          onSubmit={async (f) => {
            await action("staff", {
              id: target?.id,
              displayName: fString(f, "displayName"),
              role: fString(f, "role"),
              pin: !target || changePin ? fString(f, "pin") : undefined,
              isActive: f.get("active") === "on",
              branchIds: f.getAll("branchIds").map(String),
            });
            notify("บันทึกพนักงานแล้ว");
          }}
        >
          <label className="field">
            ชื่อแสดง
            <input
              name="displayName"
              defaultValue={target?.displayName}
              required
            />
          </label>
          <label className="field">
            สิทธิ์
            <select name="role" defaultValue={target?.role ?? "CASHIER"}>
              {Object.entries(roleLabel)
                .filter(
                  ([key]) =>
                    key !== "OWNER" &&
                    (data.staff.role === "OWNER" || key !== "MANAGER"),
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
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
                  defaultChecked={
                    target
                      ? target.branchIds.includes(branch.id)
                      : branch.id === data.branch.id
                  }
                />
                {branch.name}
              </label>
            ))}
            <small>
              การสร้างสาขาใหม่จะไม่เพิ่มสิทธิ์ให้พนักงานโดยอัตโนมัติ
            </small>
          </fieldset>
          {target && (
            <label className="check">
              <input
                type="checkbox"
                checked={changePin}
                onChange={(e) => {
                  setChangePin(e.target.checked);
                  setStaffPin("");
                }}
              />
              เปลี่ยน PIN ด้วย (ไม่เลือกจะใช้ PIN เดิม)
            </label>
          )}
          {(!target || changePin) && (
            <PinPad
              value={staffPin}
              onChange={setStaffPin}
              label={target ? "ตั้ง PIN พนักงานใหม่" : "ตั้ง PIN พนักงาน"}
            />
          )}
          <label className="check">
            <input
              name="active"
              type="checkbox"
              defaultChecked={target?.isActive ?? true}
            />
            เปิดใช้งาน
          </label>
        </FormModal>
      )}
    </>
  );
}
