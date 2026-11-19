import { publicDocuments } from "@/lib/public-documents";
import { PublicInfo } from "@/components/public-info";
import { publicMetadata } from "@/lib/public-site";
export const metadata = publicMetadata(
  "/privacy",
  "ความเป็นส่วนตัว",
  "แนวปฏิบัติด้านข้อมูลบัญชี ร้าน สาขา และการใช้งาน BUZLIKE POS ในช่วงนำร่อง",
);
export default function Page() {
  return (
    <PublicInfo title={publicDocuments["/privacy"].title}>
      {publicDocuments["/privacy"].body}
    </PublicInfo>
  );
}
