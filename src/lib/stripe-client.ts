import Stripe from "stripe";
import { assert } from "./errors";
export function stripeReady() {
  return (
    process.env.RESTORE_DRILL !== "true" &&
    !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  );
}
export function stripeClient() {
  assert(stripeReady(), "ช่องทางชำระอัตโนมัติยังไม่เปิดให้บริการ", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
    timeout: 10000,
    maxNetworkRetries: 1,
  });
}
export function stripeId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
