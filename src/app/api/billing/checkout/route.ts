import { NextRequest } from "next/server";
import { context } from "@/lib/license-guard";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { checkoutSchema, createCheckout } from "@/lib/billing-checkout";
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const body = checkoutSchema.parse(await req.json());
    const { tenant } = await context(body.storeSlug, ["OWNER"]);
    await rateLimit(`checkout:${tenant.id}`, 10, 60000);
    return createCheckout(tenant.id, body);
  });
}
