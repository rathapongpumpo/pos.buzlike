import { cache } from "react";
import { auth } from "@/auth";
import { db } from "./db";
import { releasePolicy } from "./release-policy";

// Resolve once per server render so public links and entry routes agree.
export const accountNavigation = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      systemRole: true,
      emailVerifiedAt: true,
      emailVerificationRequired: true,
      selectedPlan: true,
      pendingPilotInvitationId: true,
      pilotEnrollments: {
        where: {
          status: "RESERVED",
          activatedAt: null,
          reservedUntil: { gt: new Date() },
          invitation: { revokedAt: null, expiresAt: { gt: new Date() } },
        },
        select: { id: true },
      },
      memberships: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { ownedTenants: true } },
    },
  });
  if (!user) return null;
  const privatePilot = (await releasePolicy()).releaseMode === "PRIVATE_PILOT";
  const stores = user.memberships.filter(
    (membership, index, all) =>
      all.findIndex((item) => item.tenant.id === membership.tenant.id) ===
      index,
  );
  const admin = user.systemRole === "SUPER_ADMIN";
  const needsVerification =
    user.emailVerificationRequired && !user.emailVerifiedAt;
  const href = needsVerification
    ? "/verify-email"
    : admin
      ? "/superadmin"
      : !privatePilot && user.selectedPlan
        ? `/subscribe?plan=${user.selectedPlan}`
        : stores.length
          ? "/start"
          : privatePilot
            ? user.pendingPilotInvitationId || user.pilotEnrollments.length
              ? "/pilot"
              : "/pilot/waitlist"
            : "/onboarding";
  const label = needsVerification
    ? "ยืนยันอีเมล"
    : admin
      ? "จัดการแพลตฟอร์ม"
      : !privatePilot && user.selectedPlan
        ? "ดำเนินการแพ็กเกจต่อ"
        : stores.length > 1
          ? "เลือกร้านของคุณ"
          : stores.length
            ? "ไปที่ร้านของคุณ"
            : privatePilot
              ? user.pendingPilotInvitationId || user.pilotEnrollments.length
                ? "ดำเนินการรับสิทธิ์ต่อ"
                : "ดูสถานะลงทะเบียนรอ"
              : "ตั้งร้านต่อ";
  return {
    userId: user.id,
    needsVerification,
    email: user.email,
    stores,
    admin,
    href,
    label,
    canCreateStore:
      !admin &&
      user._count.ownedTenants < 5 &&
      (!privatePilot || user.pilotEnrollments.length > 0),
  };
});
