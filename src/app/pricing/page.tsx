import { PublicInfo } from "@/components/public-info";
import { Pricing } from "@/components/pricing";
import { db } from "@/lib/db";
import { accountNavigation } from "@/lib/account-navigation";
import { releasePolicy } from "@/lib/release-policy";
import { publicMetadata } from "@/lib/public-site";
export const dynamic = "force-dynamic";
export const metadata = publicMetadata(
  "/pricing",
  "แพ็กเกจและราคา",
  "เปรียบเทียบ Starter และ Pro ของ BUZLIKE POS พร้อมราคา ฟีเจอร์ และเงื่อนไขการเปิดบริการ",
);
export default async function Page() {
  const [account, plans, policy] = await Promise.all([
    accountNavigation(),
    db.plan.findMany(),
    releasePolicy(),
  ]);
  const privatePilot = policy.releaseMode === "PRIVATE_PILOT";
  return (
    <PublicInfo title="แพ็กเกจและราคา" wide>
      <Pricing
        plans={JSON.parse(JSON.stringify(plans))}
        entryHref={
          account?.href ?? (privatePilot ? "/pilot/waitlist" : "/register")
        }
        entryLabel={
          account?.label ?? (privatePilot ? "ลงทะเบียนรอ" : "เริ่มทดลองฟรี")
        }
        commerceAvailable={!privatePilot && policy.checkoutMode === "PUBLIC"}
      />
    </PublicInfo>
  );
}
