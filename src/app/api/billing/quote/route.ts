import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { paidPlans } from "@/lib/billing";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { assert } from "@/lib/errors";
import { assertNewCheckoutAllowed } from "@/lib/release-policy";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const b = z
      .object({
        storeSlug: z.string(),
        planCode: z.enum(paidPlans),
        coupon: z.string().trim().max(40).default(""),
      })
      .parse(await req.json());
    const { tenant } = await context(b.storeSlug, ["OWNER"]);
    await assertNewCheckoutAllowed();
    await rateLimit(`billing-quote:${tenant.id}`, 30, 60000);
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: b.planCode },
    });
    let amount = Number(plan.price);
    if (b.coupon) {
      const c = await db.coupon.findUnique({
        where: { code: b.coupon.toUpperCase() },
      });
      assert(
        c?.isActive &&
          c.percent > 0 &&
          c.percent < 100 &&
          (!c.expiresAt || +c.expiresAt > Date.now()),
        "คูปองไม่ถูกต้องหรือหมดอายุ",
      );
      amount = Math.round(amount * (100 - c.percent)) / 100;
    }
    const vat = Math.round(amount * 7) / 100;
    return { amount, vat, total: Math.round((amount + vat) * 100) / 100 };
  });
}
