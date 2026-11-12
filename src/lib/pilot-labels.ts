export const pilotLabels: Record<string, string> = {
  NEW: "ส่งเรื่องแล้ว",
  TRIAGED: "รับเรื่องแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  RESOLVED: "แก้ไขแล้ว",
  BUG: "ปัญหาการใช้งาน",
  USABILITY: "ใช้งานไม่สะดวก",
  FEATURE: "เสนอฟีเจอร์",
  GENERAL: "อื่น ๆ",
  P3: "ต่ำ",
  P2: "ปานกลาง",
  P1: "สูง",
  P0: "เร่งด่วนมาก",
  MOBILE: "มือถือ",
  TABLET: "แท็บเล็ต",
  DESKTOP: "คอมพิวเตอร์",
  DRAFT: "ฉบับร่าง",
  OPEN: "เปิดรับ",
  PAUSED: "พักรับ",
  CLOSED: "ปิดรับ",
  RESERVED: "จองแล้ว",
  ACTIVE: "กำลังใช้งาน",
  EXPIRED: "หมดสิทธิ์",
  RELEASED: "คืนการจอง",
  REVOKED: "ถอนสิทธิ์",
  CONVERTED: "เปลี่ยนแพ็กเกจแล้ว",
};
export const pilotDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export type FeedbackRow = {
  id: string;
  category: string;
  message: string;
  status: string;
  severity: string | null;
  optionalRating: number | null;
  deviceClass: string;
  pageKey: string;
  createdAt: string;
  tenantId: string;
  branchId: string;
  branch: { name: string };
  staff: { displayName: string };
  tenant?: { name: string; businessType: string };
  history: {
    id: string;
    fromStatus: string;
    toStatus: string;
    note: string;
    createdAt: string;
    actor?: { email: string };
  }[];
};
