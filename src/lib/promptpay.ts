import generatePayload from "promptpay-qr";
import { assert } from "./errors";
export function promptpay(id: string | undefined | null, amount: number) {
  assert(
    id && /^(\d{10}|\d{13})$/.test(id),
    "กรุณาตั้งค่าเลขพร้อมเพย์ที่ถูกต้อง",
  );
  assert(
    Number.isFinite(amount) && amount > 0 && amount < 10000000,
    "ยอดชำระไม่ถูกต้อง",
  );
  return generatePayload(id, { amount });
}
