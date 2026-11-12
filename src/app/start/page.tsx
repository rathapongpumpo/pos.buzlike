import Link from "next/link";
import { accountNavigation } from "@/lib/account-navigation";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { AccountSignOut } from "@/components/account-controls";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { releasePolicy } from "@/lib/release-policy";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const account = await accountNavigation();
  if (!account) redirect("/login");
  if (account.needsVerification) redirect("/verify-email");
  if (account.admin) redirect("/superadmin");
  const user = await db.user.findUniqueOrThrow({
    where: { id: account.userId },
  });
  const privatePilot = (await releasePolicy()).releaseMode === "PRIVATE_PILOT";
  if (!privatePilot && user.selectedPlan && (await searchParams).switch !== "1")
    redirect(`/subscribe?plan=${user.selectedPlan}`);
  if (!account.stores.length)
    redirect(privatePilot ? account.href : "/onboarding");
  if (account.stores.length === 1 && (await searchParams).switch !== "1")
    redirect(`/${account.stores[0].tenant.slug}/start`);
  return (
    <AuthLayout variant="setup">
      <section className="auth-card store-picker">
        <div className="account-toolbar">
          <Link href="/">กลับหน้าแรก</Link>
          <AccountSignOut userId={account.userId} />
        </div>
        <h1>เลือกร้านของคุณ</h1>
        <p>เลือกร้านที่ต้องการใช้งาน หรือสร้างร้านเพิ่มแยกจากร้านเดิม</p>
        <ul className="store-picker-list">
          {account.stores.map(({ tenant }) => (
            <li key={tenant.id}>
              <Button asChild variant="outline" className="full">
                <Link href={`/${tenant.slug}/start`}>{tenant.name}</Link>
              </Button>
            </li>
          ))}
        </ul>
        {account.canCreateStore && (
          <Button asChild className="full">
            <Link href="/onboarding?new=1">สร้างร้านเพิ่ม</Link>
          </Button>
        )}
      </section>
    </AuthLayout>
  );
}
