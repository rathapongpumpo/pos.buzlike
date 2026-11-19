import { publicDocuments } from "@/lib/public-documents";
import { PublicInfo } from "@/components/public-info";
import { publicMetadata } from "@/lib/public-site";
export const metadata = publicMetadata(
  "/support",
  "ติดต่อและช่วยเหลือ",
  "ช่องทางติดต่อทีม BUZLIKE POS และแนวทางแจ้งปัญหาการเข้าสู่ระบบ บิล สต็อก และการใช้งานร้าน",
);
export default function Page() {
  return (
    <PublicInfo title={publicDocuments["/support"].title}>
      {publicDocuments["/support"].body}
    </PublicInfo>
  );
}
