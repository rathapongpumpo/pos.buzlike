import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { createCheckout, checkoutSchema } from "@/lib/billing-checkout";
import { assert } from "@/lib/errors";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const b = await req.json();
    const { tenant } = await context(String(b.storeSlug), ["OWNER"]);
    await rateLimit(`checkout:${tenant.id}`, 10, 60000);
    const p = await db.saasPayment.findFirst({
      where: {
        id: String(b.paymentId),
        tenantId: tenant.id,
        status: "PENDING",
      },
    });
    assert(p, "ไม่พบรายการรอชำระ", 404);
    const snapshot = p.receipt as { checkoutInput?: unknown } | null;
    assert(snapshot?.checkoutInput, "รายการเดิมต้องตรวจสอบกับผู้ดูแลก่อน", 409);
    return createCheckout(
      tenant.id,
      checkoutSchema.parse(snapshot.checkoutInput),
    );
  });
}
