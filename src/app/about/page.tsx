import { publicDocuments } from "@/lib/public-documents";
import { PublicInfo } from "@/components/public-info";
import { publicMetadata } from "@/lib/public-site";
export const metadata = publicMetadata(
  "/about",
  "เกี่ยวกับเรา",
  "รู้จัก BUZLIKE POS ระบบขายหน้าร้านจาก BUZLIKE SYSTEMS สำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก",
);
export default function Page() {
  return (
    <PublicInfo title={publicDocuments["/about"].title}>
      {publicDocuments["/about"].body}
    </PublicInfo>
  );
}
