import { Tenant, StaffRole } from "@prisma/client";
import { db } from "./db";
import { auth } from "@/auth";
import { assert } from "./errors";
import { mayAssumeRole, staffBranchIds } from "./branch-access";
import { effectiveTenant, effectiveTenantById } from "./entitlements";
export { subscriptionState } from "./entitlements";
export async function context(
  slug: string,
  roles: StaffRole[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN", "WAITER"],
  write = false,
  requestedBranchId?: string | null,
) {
  const session = await auth();
  assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
  assert(!session.user.needsVerification, "กรุณายืนยันอีเมลก่อนใช้งาน", 403);
  const baseTenant = await db.tenant.findUnique({ where: { slug } });
  assert(baseTenant, "ไม่พบร้านค้า", 404);
  const { tenant, entitlement } = await effectiveTenant(baseTenant);
  const membership = await db.staffMember.findFirst({
    where: { tenantId: tenant.id, userId: session.user.id, isActive: true },
  });
  assert(membership, "ไม่มีสิทธิ์เข้าถึงร้านค้านี้", 403);
  // PIN may reduce owner permissions but never grant privileges outside this tenant.
  const { cookies } = await import("next/headers");
  const switched = (await cookies()).get(`pos-staff-${tenant.id}`)?.value;
  let staff = membership;
  if (switched) {
    const { verifyStaffCookie } = await import("./staff-session");
    const id = verifyStaffCookie(switched, session.user.id, tenant.id);
    assert(id, "สถานะพนักงานหมดอายุ กรุณาออกแล้วเข้าสู่ระบบใหม่", 403);
    if (id) {
      const match = await db.staffMember.findFirst({
        where: { id, tenantId: tenant.id, isActive: true },
      });
      assert(
        match && mayAssumeRole(membership.role, match.role),
        "พนักงานนี้ไม่มีสิทธิ์ใช้งานผ่านบัญชีนี้",
        403,
      );
      staff = match;
    }
  }
  assert(roles.includes(staff.role), "ไม่มีสิทธิ์ทำรายการนี้", 403);
  const state = entitlement.state;
  assert(state !== "SUSPENDED", "ร้านค้าถูกระงับการใช้งาน", 403);
  if (write)
    assert(
      state !== "READ_ONLY",
      "แพ็กเกจหมดอายุ กรุณาต่ออายุที่หน้าแพ็กเกจ",
      402,
    );
  const [accountBranches, operatorBranches] = await Promise.all([
    staffBranchIds(tenant.id, membership.id, membership.role),
    staffBranchIds(tenant.id, staff.id, staff.role),
  ]);
  const allowedBranches = accountBranches.filter((id) =>
    operatorBranches.includes(id),
  );
  const branches = await db.storeBranch.findMany({
    where: { tenantId: tenant.id, isActive: true, id: { in: allowedBranches } },
    orderBy: { id: "asc" },
  });
  assert(
    branches.length,
    "ยังไม่ได้รับสิทธิ์เข้าสาขา กรุณาติดต่อเจ้าของร้าน",
    403,
  );
  const branch = requestedBranchId
    ? branches.find((b) => b.id === requestedBranchId)
    : branches[0];
  assert(branch, "ไม่มีสิทธิ์เข้าถึงสาขานี้", 403);
  return {
    tenant,
    staff,
    membership,
    session,
    branch,
    branches,
    state,
    entitlement,
  };
}
export function feature(
  t: Tenant,
  key: "enableKds" | "enableQrOrder" | "enableRecipeBom" | "enableExport",
) {
  assert(t[key], "แพ็กเกจนี้ไม่รองรับฟีเจอร์ กรุณาอัปเกรด", 402);
}
export async function assertTenantQuota(
  tenantId: string,
  kind: "products" | "staff" | "branches",
) {
  const { tenant: t } = await effectiveTenantById(tenantId);
  const max =
    kind === "products"
      ? t.maxProducts
      : kind === "staff"
        ? t.maxStaff
        : t.maxBranches;
  const count =
    kind === "products"
      ? await db.product.count({ where: { tenantId } })
      : kind === "staff"
        ? await db.staffMember.count({ where: { tenantId, isActive: true } })
        : await db.storeBranch.count({ where: { tenantId, isActive: true } });
  assert(max < 0 || count < max, "ใช้งานครบโควตาแล้ว กรุณาอัปเกรดแพ็กเกจ", 402);
}
