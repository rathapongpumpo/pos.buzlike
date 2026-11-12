import type { PlanCode } from "@prisma/client";
// Public fallback and fresh installations share the same approved price list.
// Checkout continues to use the editable Plan record in PostgreSQL.
export const planPrices: Record<PlanCode, number> = {
  FREE_TRIAL: 0,
  STARTER_MONTHLY: 199,
  STARTER_YEARLY: 1990,
  PRO_MONTHLY: 499,
  PRO_YEARLY: 4990,
  LIFETIME_BUYOUT: 12900,
};
