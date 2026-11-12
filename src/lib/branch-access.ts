import type { Prisma, StaffRole } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";

export function mayAssumeRole(accountRole: StaffRole, operatorRole: StaffRole) {
  if (accountRole === "OWNER") return true;
  if (accountRole === "MANAGER") return operatorRole !== "OWNER";
  return accountRole === operatorRole;
}
export async function staffBranchIds(
  tenantId: string,
  staffId: string,
  role: StaffRole,
) {
  const branches = await db.storeBranch.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(role === "OWNER"
        ? {}
        : { staffAccess: { some: { tenantId, staffId } } }),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return branches.map((branch) => branch.id);
}
export async function assertStaffBranch(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  staffId: string,
) {
  const staff = await tx.staffMember.findFirst({
    where: { id: staffId, tenantId, isActive: true },
  });
  assert(staff, "พนักงานไม่พร้อมใช้งาน", 403);
  assert(
    staff.role === "OWNER" ||
      (await tx.staffBranchAccess.findFirst({
        where: { tenantId, branchId, staffId },
      })),
    "พนักงานไม่มีสิทธิ์ในสาขานี้",
    403,
  );
}
