import { NextRequest } from "next/server";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { auth } from "@/auth";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { sameOrigin } from "@/lib/security";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const form = await req.formData();
    const { tenant } = await context(String(form.get("storeSlug")), ["OWNER"]);
    const id = String(form.get("paymentId"));
    const payment = await db.saasPayment.findFirst({
      where: {
        id,
        tenantId: tenant.id,
        status: "PENDING",
        paymentMethod: "BANK_SLIP",
      },
    });
    assert(payment, "ไม่พบใบแจ้งหนี้", 404);
    const file = form.get("file");
    assert(
      file instanceof File && file.size > 0 && file.size <= 5 * 1024 * 1024,
      "สลิปต้องเป็นภาพไม่เกิน 5 MB",
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    assert(png || jpg, "รองรับเฉพาะภาพ PNG/JPEG");
    await mkdir("data/slips", { recursive: true });
    const filename = `${payment.id}.${png ? "png" : "jpg"}`;
    await writeFile(path.join("data/slips", filename), bytes);
    await db.saasPayment.update({
      where: { id, tenantId: tenant.id },
      data: { slipImageUrl: filename },
    });
    return { ok: true };
  });
}
export async function GET(req: NextRequest) {
  return respond(async () => {
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    assert(user.systemRole === "SUPER_ADMIN", "ไม่มีสิทธิ์", 403);
    const payment = await db.saasPayment.findUnique({
      where: { id: req.nextUrl.searchParams.get("id") ?? "" },
    });
    assert(
      payment?.slipImageUrl &&
        /^[a-z0-9]+\.(png|jpg)$/.test(payment.slipImageUrl),
      "ไม่พบสลิป",
      404,
    );
    const bytes = await readFile(path.join("data/slips", payment.slipImageUrl));
    return new Response(bytes, {
      headers: {
        "Content-Type": payment.slipImageUrl.endsWith("png")
          ? "image/png"
          : "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
