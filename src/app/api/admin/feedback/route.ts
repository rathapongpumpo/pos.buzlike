import { z } from "zod";
import { BusinessType } from "@prisma/client";
import { db } from "@/lib/db";
import { respond } from "@/lib/http";
import { requirePilotAdmin } from "@/lib/pilot-admin-http";
import {
  feedbackStatuses,
  feedbackCategories,
  updateFeedback,
} from "@/lib/pilot-feedback";
export async function GET(req: Request) {
  return respond(async () => {
    await requirePilotAdmin(req);
    const query = z
      .object({
        tenantId: z.string().optional(),
        branchId: z.string().optional(),
        businessType: z.string().max(60).optional(),
        category: z.enum(feedbackCategories).optional(),
        severity: z.enum(["P3", "P2", "P1", "P0"]).optional(),
        status: z.enum(feedbackStatuses).optional(),
        deviceClass: z.enum(["MOBILE", "TABLET", "DESKTOP"]).optional(),
      })
      .parse(Object.fromEntries(new URL(req.url).searchParams));
    const { businessType: rawBusinessType, ...where } = query;
    const businessType = rawBusinessType
      ? z.enum(BusinessType).parse(rawBusinessType)
      : undefined;
    const rows = await db.pilotFeedback.findMany({
      where: {
        ...where,
        ...(businessType ? { tenant: { businessType } } : {}),
      },
      include: {
        tenant: { select: { name: true, businessType: true } },
        branch: { select: { name: true } },
        staff: { select: { displayName: true } },
        history: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const tenants = await db.tenant.findMany({
      where: { pilotEnrollments: { some: { activatedAt: { not: null } } } },
      select: {
        id: true,
        name: true,
        businessType: true,
        branches: { select: { id: true, name: true } },
      },
    });
    return { rows, tenants };
  });
}
export async function POST(req: Request) {
  return respond(async () => {
    const actor = await requirePilotAdmin(req, true);
    const input = z
      .object({
        id: z.string().min(1),
        expectedStatus: z.enum(feedbackStatuses),
        expectedHistoryId: z.string().min(1).nullable(),
        status: z.enum(feedbackStatuses),
        severity: z.enum(["P3", "P2", "P1", "P0"]),
        note: z.string().trim().min(3).max(2000),
      })
      .strict()
      .parse(await req.json());
    return updateFeedback(actor.id, input);
  });
}
