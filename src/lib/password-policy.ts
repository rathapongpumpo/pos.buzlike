import { z } from "zod";
// bcrypt must not silently truncate passwords after 72 UTF-8 bytes.
export const newPassword = z
  .string()
  .min(10, "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร")
  .max(128)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "รหัสผ่านยาวเกินไปสำหรับตัวอักษรที่ใช้ กรุณาลดความยาว",
  );
