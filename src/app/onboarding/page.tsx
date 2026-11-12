import Link from "next/link";
import { accountNavigation } from "@/lib/account-navigation";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { AuthLayout } from "@/components/auth-layout";
import { AccountSignOut } from "@/components/account-controls";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { isPaidPlan } from "@/lib/billing";
import { PlanIntent } from "@/components/plan-intent";
import { releasePolicy } from "@/lib/release-policy";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; plan?: string }>;
}) {
  const account = await accountNavigation();
  if (!account) redirect("/login");
  if (account.needsVerification) redirect("/verify-email");
  if (account.admin) redirect("/superadmin");
  const privatePilot = (await releasePolicy()).releaseMode === "PRIVATE_PILOT";
  const reservation = await db.pilotEnrollment.findFirst({
    where: {
      ownerId: account.userId,
      status: "RESERVED",
      activatedAt: null,
      reservedUntil: { gt: new Date() },
      invitation: { revokedAt: null, expiresAt: { gt: new Date() } },
    },
    select: { id: true },
  });
  if (privatePilot && !reservation) redirect("/pilot");
  if (account.stores.length && (await searchParams).new !== "1")
    redirect("/start");
  if (!account.canCreateStore) redirect("/start");
  const draft = await db.onboardingDraft.findUnique({
    where: { userId: account.userId },
    select: {
      requestKey: true,
      name: true,
      businessType: true,
      version: true,
      completedSlug: true,
    },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: account.userId },
    select: { selectedPlan: true },
  });
  const requested = (await searchParams).plan;
  const selectedPlan =
    privatePilot || reservation
      ? null
      : isPaidPlan(requested)
        ? requested
        : user.selectedPlan;
  return (
    <AuthLayout variant="setup">
      <PlanIntent plan={selectedPlan} />
      <div className="setup-account-bar onboarding-account-bar">
        <span>เข้าสู่ระบบแล้ว</span>
        {account.stores.length > 0 && (
          <Link href="/start">กลับไปร้านของคุณ</Link>
        )}
        <AccountSignOut userId={account.userId} />
      </div>
      <Onboarding
        pilotEnrollmentId={reservation?.id}
        selectedPlan={selectedPlan}
        initialDraft={
          draft ?? {
            requestKey: randomUUID(),
            name: "",
            businessType: "CAFE_BEVERAGE",
            version: 0,
            completedSlug: null,
          }
        }
      />
    </AuthLayout>
  );
}
