import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import Stripe from "stripe";
import { safeServerError } from "./operations";
export async function respond(fn: () => Promise<unknown>, status = 200) {
  try {
    const result = await fn();
    return result instanceof Response
      ? result
      : NextResponse.json(result, { status });
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError)
      return NextResponse.json(
        {
          error:
            "ติดต่อผู้ให้บริการชำระเงินไม่สำเร็จ กรุณาลองรายการเดิมอีกครั้งหรือตรวจสอบสถานะ",
        },
        { status: 503 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(", "),
        },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json(
          { error: "ข้อมูลซ้ำ กรุณาตรวจสอบอีเมล รหัสร้าน หรือรหัสสินค้า" },
          { status: 409 },
        );
      if (e.code === "P2025")
        return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    }
    const requestId = safeServerError(e);
    return NextResponse.json(
      { error: "ระบบขัดข้อง กรุณาลองใหม่", requestId },
      { status: 500 },
    );
  }
}
