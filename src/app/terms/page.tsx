import { publicDocuments } from "@/lib/public-documents";
import { PublicInfo } from "@/components/public-info";
import { publicMetadata } from "@/lib/public-site";
export const metadata = publicMetadata(
  "/terms",
  "ข้อกำหนดนำร่อง",
  "ข้อกำหนดและเงื่อนไขโครงการนำร่อง BUZLIKE POS สำหรับธุรกิจที่ได้รับคำเชิญ",
);
export default function Page() {
  return (
    <PublicInfo title={publicDocuments["/terms"].title}>
      {publicDocuments["/terms"].body}
    </PublicInfo>
  );
}
