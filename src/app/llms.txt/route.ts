import { publicPages, siteOrigin } from "@/lib/public-site";
import { contentSignal, markdownPath } from "@/lib/public-formats";
export const dynamic = "force-static";
export function GET() {
  const names = [
    "ข้อมูลผลิตภัณฑ์และฟีเจอร์",
    "แพ็กเกจ ราคา และสถานะการเปิดบริการ",
    "เกี่ยวกับผู้ให้บริการ",
    "ติดต่อและแจ้งปัญหา",
    "ความเป็นส่วนตัว",
    "ข้อกำหนดนำร่อง",
  ];
  const body =
    "# BUZLIKE POS\n\n> ระบบขายหน้าร้านสำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก โดย BUZLIKE SYSTEMS\n\nเอกสารนี้ครอบคลุมข้อมูลบริการสาธารณะเท่านั้น ราคา เงื่อนไข และสถานะการรับสมัครปัจจุบันอยู่ในเอกสารแพ็กเกจ ไม่ครอบคลุมข้อมูลร้าน บิล ลูกค้า พนักงาน หรือสาขาของผู้ใช้\n\n## ข้อมูลบริการ\n\n" +
    publicPages
      .map((p, i) => `- [${names[i]}](${siteOrigin}${markdownPath(p)})`)
      .join("\n") +
    `\n\n## เว็บไซต์\n\n- [BUZLIKE POS](${siteOrigin}/)\n- [BUZLIKE SYSTEMS](https://buzlike.com/)\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Signal": contentSignal,
    },
  });
}
