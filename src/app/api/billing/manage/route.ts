import { NextRequest } from "next/server";
import { z } from "zod";
import { db, serial } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { stripeClient } from "@/lib/stripe-client";
import { syncCheckout, syncSubscription } from "@/lib/stripe-billing";
import { withBillingLock, assertBillingLock } from "@/lib/billing-lock";
import { assert } from "@/lib/errors";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const b = z
      .object({
        storeSlug: z.string(),
        action: z.enum(["cancel", "resume", "payment-method", "abandon"]),
        paymentId: z.string().optional(),
      })
      .parse(await req.json());
    const { tenant } = await context(b.storeSlug, ["OWNER"]);
    await rateLimit(`billing-manage:${tenant.id}`, 10, 60000);
    if (b.action === "abandon") {
      assert(b.paymentId, "ไม่พบรายการชำระ");
      const p = await db.saasPayment.findFirst({
        where: { id: b.paymentId, tenantId: tenant.id, status: "PENDING" },
      });
      assert(p, "ไม่พบรายการรอชำระ", 404);
      if (p.paymentMethod === "BANK_SLIP") {
        assert(!p.slipImageUrl, "ส่งสลิปแล้ว กรุณารอผลตรวจสอบก่อน", 409);
        await db.saasPayment.updateMany({
          where: { id: p.id, status: "PENDING", slipImageUrl: null },
          data: { status: "CANCELED" },
        });
      } else {
        // Resolve uncertain provider creation with the original idempotency key before allowing abandonment.
        assert(
          p.providerRef?.startsWith("cs_"),
          "กรุณาลองดำเนินการชำระเดิมอีกครั้งเพื่อยืนยันสถานะก่อน",
          409,
        );
        const stripe = stripeClient();
        await withBillingLock(tenant.id, async () => {
          const s = await stripe.checkout.sessions.retrieve(p.providerRef!);
          assert(
            s.status === "open" || s.status === "expired",
            "รายการนี้กำลังรับชำระหรือจ่ายแล้ว กรุณาตรวจสอบสถานะ",
            409,
          );
          if (s.status === "open") await stripe.checkout.sessions.expire(s.id);
        });
        await syncCheckout(p.id, tenant.id, stripe);
      }
      return { ok: true };
    }
    const stripe = stripeClient();
    assert(
      tenant.stripeSubId &&
        !["canceled", "incomplete_expired"].includes(
          tenant.stripeSubscriptionStatus ?? "",
        ),
      "ไม่มีการต่ออายุผ่านบัตรที่เปิดอยู่",
      409,
    );
    if (b.action === "payment-method") {
      assert(tenant.stripeCustomerId, "ไม่พบข้อมูลลูกค้า", 409);
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/${tenant.slug}/billing`;
      const portal = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: url,
        flow_data: {
          type: "payment_method_update",
          after_completion: { type: "redirect", redirect: { return_url: url } },
        },
      });
      return { url: portal.url };
    }
    await withBillingLock(tenant.id, async (token) => {
      const sub = await stripe.subscriptions.update(tenant.stripeSubId!, {
        cancel_at_period_end: b.action === "cancel",
      });
      await serial(async (tx) => {
        await assertBillingLock(tx, tenant.id, token);
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            billingSyncedAt: new Date(),
          },
        });
      });
    });
    await syncSubscription(tenant.stripeSubId, stripe);
    return { ok: true };
  });
}
