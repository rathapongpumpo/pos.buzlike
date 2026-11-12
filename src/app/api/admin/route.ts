import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { sameOrigin } from "@/lib/security";
import { activatePayment } from "@/lib/billing";
async function admin() {
  const session = await auth();
  assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  assert(user.systemRole === "SUPER_ADMIN", "ไม่มีสิทธิ์ผู้ดูแลแพลตฟอร์ม", 403);
  return user;
}
export async function GET() {
  return respond(async () => {
    await admin();
    const [tenants, payments, plans, coupons, emailPending] = await Promise.all(
      [
        db.tenant.findMany({
          include: { owner: { select: { email: true, fullName: true } } },
          orderBy: { createdAt: "desc" },
        }),
        db.saasPayment.findMany({
          orderBy: { createdAt: "desc" },
          include: { tenant: { select: { name: true, slug: true } } },
        }),
        db.plan.findMany(),
        db.coupon.findMany(),
        db.emailOutbox.count({
          where: {
            sentAt: null,
            failedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
      ],
    );
    const emailFailed = await db.emailOutbox.count({
      where: {
        sentAt: null,
        failedAt: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return {
      tenants,
      payments,
      plans,
      coupons,
      emailPending,
      emailFailed,
      smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
    };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const user = await admin();
    const b = await req.json();
    const action = z
      .enum([
        "extend",
        "suspend",
        "restore",
        "plan",
        "approve",
        "reject",
        "price",
        "coupon",
        "retryEmail",
      ])
      .parse(b.action);
    if (action === "retryEmail") {
      await db.emailOutbox.updateMany({
        where: {
          sentAt: null,
          lockedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        data: { failedAt: null, attempts: 0, availableAt: new Date() },
      });
      return { ok: true };
    }
    if (action === "price") {
      const input = z
        .object({
          code: z.enum([
            "FREE_TRIAL",
            "STARTER_MONTHLY",
            "STARTER_YEARLY",
            "PRO_MONTHLY",
            "PRO_YEARLY",
            "LIFETIME_BUYOUT",
          ]),
          price: z.number().nonnegative().max(10000000),
        })
        .parse(b);
      return db.plan.update({
        where: { code: input.code },
        data: { price: input.price },
      });
    }
    if (action === "coupon") {
      const input = z
        .object({
          code: z
            .string()
            .min(2)
            .max(40)
            .regex(/^[A-Z0-9-]+$/),
          percent: z.number().int().min(1).max(99),
          isActive: z.boolean(),
          expiresAt: z.string().optional(),
        })
        .parse(b);
      const data = {
        percent: input.percent,
        isActive: input.isActive,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      };
      return db.coupon.upsert({
        where: { code: input.code },
        create: { code: input.code, ...data },
        update: data,
      });
    }
    const tenantId = z.string().parse(b.tenantId);
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const result = await serial(async (tx) => {
      if (action === "approve") {
        const payment = await tx.saasPayment.findFirst({
          where: {
            tenantId,
            id: z.string().parse(b.paymentId),
            paymentMethod: "BANK_SLIP",
          },
        });
        assert(payment?.slipImageUrl, "ต้องมีสลิปก่อนอนุมัติ");
        await activatePayment(tx, payment.id, tenantId);
      }
      if (action === "reject")
        await tx.saasPayment.updateMany({
          where: {
            tenantId,
            id: z.string().parse(b.paymentId),
            status: "PENDING",
            paymentMethod: "BANK_SLIP",
          },
          data: { status: "FAILED" },
        });
      if (action === "extend") {
        const days = z.union([z.literal(7), z.literal(30)]).parse(b.days);
        assert(
          tenant.subscriptionStatus === "TRIALING" ||
            (tenant.subscriptionStatus === "READ_ONLY" &&
              tenant.planCode === "FREE_TRIAL"),
          "ขยายเวลาเฉพาะร้านทดลองใช้",
        );
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            trialEndsAt: new Date(
              Math.max(Date.now(), +tenant.trialEndsAt) + days * 86400000,
            ),
            subscriptionStatus: "TRIALING",
          },
        });
      }
      if (action === "suspend")
        await tx.tenant.update({
          where: { id: tenantId },
          data: { subscriptionStatus: "SUSPENDED" },
        });
      if (action === "restore") {
        assert(tenant.subscriptionStatus === "SUSPENDED", "ร้านไม่ได้ถูกระงับ");
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionStatus: tenant.isLifetime
              ? "LIFETIME_ACTIVE"
              : tenant.planCode === "FREE_TRIAL"
                ? "TRIALING"
                : "ACTIVE",
          },
        });
      }
      if (action === "plan") {
        const plan = await tx.plan.findUniqueOrThrow({
          where: {
            code: z
              .enum([
                "FREE_TRIAL",
                "STARTER_MONTHLY",
                "STARTER_YEARLY",
                "PRO_MONTHLY",
                "PRO_YEARLY",
                "LIFETIME_BUYOUT",
              ])
              .parse(b.planCode),
          },
        });
        const { code, name, price, ...rights } = plan;
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            ...rights,
            planCode: code,
            isLifetime: code === "LIFETIME_BUYOUT",
            subscriptionStatus:
              code === "LIFETIME_BUYOUT"
                ? "LIFETIME_ACTIVE"
                : code === "FREE_TRIAL"
                  ? "TRIALING"
                  : "ACTIVE",
            currentPeriodEndsAt:
              code === "LIFETIME_BUYOUT"
                ? null
                : new Date(
                    Date.now() +
                      (code.includes("YEARLY") ? 365 : 30) * 86400000,
                  ),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorName: user.fullName,
          action: `ADMIN_${action.toUpperCase()}`,
          details: JSON.stringify({
            planCode: b.planCode,
            days: b.days,
            paymentId: b.paymentId,
          }),
        },
      });
      return { ok: true };
    });
    return result;
  });
}
