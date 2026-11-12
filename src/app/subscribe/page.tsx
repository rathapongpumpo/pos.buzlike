import Link from "next/link";
import { redirect } from "next/navigation";
import { accountNavigation } from "@/lib/account-navigation";
import { isPaidPlan } from "@/lib/billing";
import { db } from "@/lib/db";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { PlanIntent } from "@/components/plan-intent";
import { releasePolicy } from "@/lib/release-policy";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const policy = await releasePolicy();
  if (
    policy.releaseMode === "PRIVATE_PILOT" ||
    policy.checkoutMode !== "PUBLIC"
  )
    redirect("/pilot");
  const { plan } = await searchParams;
  if (!isPaidPlan(plan)) redirect("/#pricing");
  const next = `/subscribe?plan=${plan}`;
  const account = await accountNavigation();
  if (!account) redirect(`/register?next=${encodeURIComponent(next)}`);
  if (account.needsVerification)
    redirect(`/verify-email?next=${encodeURIComponent(next)}`);
  if (account.admin) redirect("/superadmin");
  const stores = await db.tenant.findMany({
    where: { ownerId: account.userId },
    select: { slug: true, id: true, name: true },
  });
  const selected = await db.plan.findUniqueOrThrow({ where: { code: plan } });
  if (!stores.length && account.canCreateStore)
    redirect(`/onboarding?plan=${plan}`);
  return (
    <AuthLayout variant="setup">
      <section className="auth-card store-picker">
        <PlanIntent plan={plan} />
        <Link href="/">← กลับหน้าแรก</Link>
        <h1>เลือกธุรกิจที่จะใช้ {selected.name}</h1>
        <p>
          แพ็กเกจใช้กับหนึ่งธุรกิจและสาขาภายในธุรกิจนั้น
          ตรวจสอบยอดและชำระในขั้นถัดไป
        </p>
        <ul className="store-picker-list">
          {stores.map((tenant) => (
            <li key={tenant.id}>
              <Button asChild className="full">
                <Link href={`/${tenant.slug}/billing?plan=${plan}`}>
                  {tenant.name}
                </Link>
              </Button>
              <Link href={`/${tenant.slug}/start`}>ไปที่ร้านก่อน</Link>
            </li>
          ))}
        </ul>
        {account.canCreateStore && (
          <Button asChild variant="outline" className="full">
            <Link href={`/onboarding?new=1&plan=${plan}`}>สร้างธุรกิจใหม่</Link>
          </Button>
        )}
        <Link href="/start?switch=1">เลือกร้านโดยยังไม่ชำระ</Link>
      </section>
    </AuthLayout>
  );
}
