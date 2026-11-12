import { context } from "@/lib/license-guard";
import { db } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { rateLimit, sameOrigin } from "@/lib/security";
import {
  feedbackInput,
  feedbackScope,
  submitFeedback,
} from "@/lib/pilot-feedback";
type Params = { params: Promise<{ storeSlug: string }> };
export async function GET(req: Request, { params }: Params) {
  return respond(async () => {
    const ctx = await context(
      (await params).storeSlug,
      undefined,
      false,
      new URL(req.url).searchParams.get("branchId"),
    );
    const rows = await db.pilotFeedback.findMany({
      where: feedbackScope(ctx),
      include: {
        branch: { select: { name: true } },
        staff: { select: { displayName: true } },
        history: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const enrolled = !!(await db.pilotEnrollment.count({
      where: { tenantId: ctx.tenant.id, activatedAt: { not: null } },
    }));
    return { rows, enrolled };
  });
}
export async function POST(req: Request, { params }: Params) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    const ctx = await context(
      (await params).storeSlug,
      undefined,
      false,
      new URL(req.url).searchParams.get("branchId"),
    );
    await rateLimit(
      `pilot-feedback:${ctx.tenant.id}:${ctx.staff.id}`,
      10,
      60000,
    );
    const input = feedbackInput.parse(await req.json());
    const row = await submitFeedback(ctx, input);
    return { id: row.id, status: row.status };
  });
}
