import { lockRow } from "./database-dialect";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { serial } from "./db";
import { assert } from "./errors";
import { pilotAdmin } from "./pilot-operations";
import type { context } from "./license-guard";
export const feedbackStatuses = [
  "NEW",
  "TRIAGED",
  "IN_PROGRESS",
  "RESOLVED",
] as const;
export const feedbackCategories = [
  "BUG",
  "USABILITY",
  "FEATURE",
  "GENERAL",
] as const;
export const feedbackInput = z
  .object({
    requestKey: z.uuid(),
    category: z.enum(feedbackCategories),
    message: z.string().trim().min(10).max(2000),
    optionalRating: z.number().int().min(1).max(5).optional(),
    pageKey: z.enum([
      "pos",
      "products",
      "inventory",
      "tables",
      "kds",
      "orders",
      "shifts",
      "staff",
      "settings",
      "billing",
      "dashboard",
      "feedback",
      "other",
    ]),
    deviceClass: z.enum(["MOBILE", "TABLET", "DESKTOP"]),
  })
  .strict();
export type FeedbackContext = Awaited<ReturnType<typeof context>>;
export function feedbackScope(
  ctx: FeedbackContext,
): Prisma.PilotFeedbackWhereInput {
  return {
    tenantId: ctx.tenant.id,
    ...(ctx.staff.role === "OWNER"
      ? {}
      : { submittedByStaffId: ctx.staff.id, branchId: ctx.branch.id }),
  };
}
export async function submitFeedback(
  ctx: FeedbackContext,
  input: z.infer<typeof feedbackInput>,
) {
  return serial(async (tx) => {
    // Recheck membership and branch assignment inside the transaction, including switched PIN identity.
    const members = await tx.staffMember.findMany({
      where: {
        id: { in: [ctx.membership.id, ctx.staff.id] },
        tenantId: ctx.tenant.id,
        isActive: true,
      },
      include: { branchAccess: true },
    });
    assert(
      members.length === new Set([ctx.membership.id, ctx.staff.id]).size,
      "สิทธิ์พนักงานเปลี่ยนแล้ว",
      403,
    );
    assert(
      members.find((s) => s.id === ctx.membership.id)?.userId ===
        ctx.session.user.id &&
        members.find((s) => s.id === ctx.staff.id)?.role === ctx.staff.role &&
        members.find((s) => s.id === ctx.membership.id)?.role ===
          ctx.membership.role,
      "สิทธิ์พนักงานเปลี่ยนแล้ว กรุณาโหลดใหม่",
      403,
    );
    for (const staff of members)
      assert(
        staff.role === "OWNER" ||
          staff.branchAccess.some((b) => b.branchId === ctx.branch.id),
        "ไม่มีสิทธิ์ในสาขานี้",
        403,
      );
    const branch = await tx.storeBranch.findFirst({
      where: { id: ctx.branch.id, tenantId: ctx.tenant.id, isActive: true },
    });
    assert(branch, "สาขานี้ปิดใช้งานแล้ว", 403);
    const existing = await tx.pilotFeedback.findUnique({
      where: {
        tenantId_submittedByStaffId_requestKey: {
          tenantId: ctx.tenant.id,
          submittedByStaffId: ctx.staff.id,
          requestKey: input.requestKey,
        },
      },
    });
    if (existing) {
      assert(
        existing.branchId === ctx.branch.id &&
          existing.message === input.message &&
          existing.category === input.category &&
          existing.pageKey === input.pageKey &&
          existing.deviceClass === input.deviceClass &&
          existing.optionalRating === (input.optionalRating ?? null),
        "รหัสคำขอนี้ถูกใช้กับข้อความอื่นแล้ว",
        409,
      );
      return existing;
    }
    const grant = await tx.pilotEnrollment.findFirst({
      where: { tenantId: ctx.tenant.id, activatedAt: { not: null } },
      orderBy: { activatedAt: "desc" },
    });
    assert(grant, "ร้านนี้ยังไม่ได้เข้าร่วมโครงการนำร่อง", 403);
    return tx.pilotFeedback.create({
      data: {
        ...input,
        enrollmentId: grant.id,
        tenantId: ctx.tenant.id,
        branchId: ctx.branch.id,
        submittedByUserId: ctx.session.user.id,
        submittedByStaffId: ctx.staff.id,
      },
    });
  });
}
export async function updateFeedback(
  actorId: string,
  input: {
    id: string;
    expectedStatus: string;
    expectedHistoryId: string | null;
    status: string;
    severity: string;
    note: string;
  },
) {
  return serial(async (tx) => {
    await pilotAdmin(tx, actorId);
    await lockRow(tx, "PilotFeedback", input.id);
    const old = await tx.pilotFeedback.findUniqueOrThrow({
      where: { id: input.id },
    });
    assert(
      old.status === input.expectedStatus,
      "สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่",
      409,
    );
    const history = await tx.pilotFeedbackHistory.findMany({
      where: { feedbackId: old.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (
      old.status === input.status &&
      old.severity === input.severity &&
      history[0]?.note === input.note
    )
      return { id: old.id, status: old.status };
    assert(
      (history[0]?.id ?? null) === input.expectedHistoryId,
      "ข้อมูลเรื่องเปลี่ยนแล้ว กรุณาโหลดใหม่",
      409,
    );
    await tx.pilotFeedback.update({
      where: { id: old.id },
      data: { status: input.status, severity: input.severity },
    });
    await tx.pilotFeedbackHistory.create({
      data: {
        feedbackId: old.id,
        actorUserId: actorId,
        fromStatus: old.status,
        toStatus: input.status,
        note: input.note,
      },
    });
    return { id: old.id, status: input.status };
  });
}
