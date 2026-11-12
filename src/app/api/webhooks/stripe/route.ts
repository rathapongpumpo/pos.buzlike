import Stripe from "stripe";
import { stripeClient } from "@/lib/stripe-client";
import { receiveBillingEvent } from "@/lib/stripe-billing";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
export async function POST(req: Request) {
  return respond(async () => {
    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        await req.text(),
        req.headers.get("stripe-signature") ?? "",
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      assert(false, "ลายเซ็น Webhook ไม่ถูกต้อง", 400);
    }
    assert(
      event.livemode === process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_"),
      "โหมดชำระไม่ตรงกับระบบ",
      400,
    );
    await receiveBillingEvent(event);
    // Acknowledge immediately after durable storage; the billing worker performs provider calls.
    return { received: true };
  });
}
