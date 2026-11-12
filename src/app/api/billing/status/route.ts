import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { syncCheckout, syncSubscription } from "@/lib/stripe-billing";
import { assert } from "@/lib/errors";
import { effectiveTenantById } from "@/lib/entitlements";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const b = await req.json();
    const { tenant } = await context(String(b.storeSlug), ["OWNER"]);
    await rateLimit(`billing-status:${tenant.id}`, 30, 60000);
    if (b.paymentId) {
      const p = await db.saasPayment.findFirst({
        where: { id: String(b.paymentId), tenantId: tenant.id },
      });
      assert(p, "ไม่พบรายการชำระ", 404);
      if (p.paymentMethod.startsWith("STRIPE"))
        await syncCheckout(p.id, tenant.id);
    } else if (tenant.stripeSubId) await syncSubscription(tenant.stripeSubId);
    const { tenant: t, entitlement } = await effectiveTenantById(tenant.id);
    const payments = await db.saasPayment.findMany({
      where: { tenantId: t.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      state: entitlement.state,
      entitlement,
      payments,
      checkedAt: t.billingSyncedAt,
    };
  });
}
