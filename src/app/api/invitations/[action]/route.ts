import { z } from "zod";
import { hash } from "bcryptjs";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { context } from "@/lib/license-guard";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
import { newToken, tokenHash } from "@/lib/account-tokens";
import { queueAccountMail, appLink } from "@/lib/email-outbox";
import { effectiveTenant } from "@/lib/entitlements";
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
async function owner(slug: string, branchId?: string) {
  return context(slug, ["OWNER"], true, branchId);
}
export async function GET(req: Request) {
  return respond(async () => {
    const url = new URL(req.url);
    const { tenant } = await owner(
      url.searchParams.get("storeSlug") ?? "",
      url.searchParams.get("branchId") ?? undefined,
    );
    const invitations = await db.staffInvitation.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        email: true,
        staffId: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
        staff: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { invitations };
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return respond(async () => {
    sameOrigin(req);
    const { action } = await params,
      body = await req.json();
    await rateLimit(
      `invite-ip:${action}:${req.headers.get("x-forwarded-for") ?? "local"}`,
      30,
      900000,
    );
    if (action === "preview" || action === "accept") {
      const { token } = z.object({ token: tokenSchema }).parse(body);
      const invite = await db.staffInvitation.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { staff: { include: { tenant: true } } },
      });
      assert(
        invite &&
          !invite.acceptedAt &&
          !invite.revokedAt &&
          invite.expiresAt > new Date(),
        "คำเชิญหมดอายุ ถูกยกเลิก หรือใช้แล้ว กรุณาติดต่อเจ้าของร้าน",
        400,
      );
      if (action === "preview")
        return {
          email: invite.email,
          storeName: invite.staff.tenant.name,
          displayName: invite.staff.displayName,
        };
      const session = await auth();
      assert(session?.user?.id, "กรุณาเข้าสู่ระบบก่อนรับคำเชิญ", 401);
      assert(
        !session.user.needsVerification,
        "กรุณายืนยันอีเมลก่อนรับคำเชิญ",
        403,
      );
      const input = z
        .object({ pin: z.string().regex(/^\d{4,6}$/), confirmPin: z.string() })
        .refine((i) => i.pin === i.confirmPin, {
          message: "PIN ทั้งสองครั้งไม่ตรงกัน",
        })
        .parse(body);
      const pinCodeHash = await hash(input.pin, 10);
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invite.tenantId}))`;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: session.user.id },
        });
        assert(
          user.email === invite.email,
          "กรุณาใช้บัญชีอีเมลที่ได้รับคำเชิญ",
          403,
        );
        const current = await tx.staffInvitation.findUniqueOrThrow({
          where: { id: invite.id },
          include: {
            staff: {
              include: {
                tenant: true,
                branchAccess: { include: { branch: true } },
              },
            },
          },
        });
        assert(
          current.tokenHash === tokenHash(token) &&
            !current.acceptedAt &&
            !current.revokedAt &&
            current.expiresAt > new Date(),
          "คำเชิญใช้ไม่ได้แล้ว",
          400,
        );
        const effective = await effectiveTenant(current.staff.tenant, tx);
        assert(
          !["READ_ONLY", "SUSPENDED"].includes(effective.entitlement.state),
          "ร้านยังไม่พร้อมรับพนักงาน กรุณาติดต่อเจ้าของร้าน",
          403,
        );
        assert(
          current.staff.role !== "OWNER" && !current.staff.userId,
          "พนักงานนี้มีบัญชีแล้ว",
          409,
        );
        assert(
          current.staff.branchAccess.some((g) => g.branch.isActive),
          "ยังไม่ได้กำหนดสาขาให้พนักงาน",
          409,
        );
        const count = await tx.staffMember.count({
          where: {
            tenantId: invite.tenantId,
            isActive: true,
            id: { not: current.staffId },
          },
        });
        assert(
          effective.tenant.maxStaff < 0 || count < effective.tenant.maxStaff,
          "พนักงานเต็มโควตา กรุณาติดต่อเจ้าของร้าน",
          402,
        );
        assert(
          !(await tx.staffMember.count({
            where: { tenantId: invite.tenantId, userId: user.id },
          })),
          "บัญชีนี้เป็นสมาชิกของร้านแล้ว",
          409,
        );
        await tx.staffMember.update({
          where: { id: current.staffId },
          data: { userId: user.id, pinCodeHash, isActive: true },
        });
        await tx.staffInvitation.update({
          where: { id: current.id },
          data: { acceptedAt: new Date() },
        });
        return { slug: current.staff.tenant.slug };
      });
    }
    const base = z
      .object({ storeSlug: z.string(), branchId: z.string().optional() })
      .parse(body);
    const ctx = await owner(base.storeSlug, base.branchId);
    await rateLimit(`invite-owner:${ctx.session.user.id}`, 20, 3600000);
    if (action === "create" || action === "resend" || action === "revoke") {
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenant.id}))`;
        const rawTenant = await tx.tenant.findUniqueOrThrow({
          where: { id: ctx.tenant.id },
        });
        const { tenant: currentTenant } = await effectiveTenant(rawTenant, tx);
        let invite;
        if (action === "create") {
          const input = z
            .object({
              email: z.string().trim().toLowerCase().email().max(254),
              displayName: z.string().trim().min(1).max(120),
              role: z.enum(["MANAGER", "CASHIER", "KITCHEN", "WAITER"]),
              branchIds: z.array(z.string()).min(1).max(100),
            })
            .parse(body);
          assert(
            input.branchIds.every((id) =>
              ctx.branches.some((b) => b.id === id),
            ),
            "ไม่มีสิทธิ์กำหนดสาขานี้",
            403,
          );
          assert(
            !(await tx.staffMember.count({
              where: { tenantId: ctx.tenant.id, user: { email: input.email } },
            })),
            "อีเมลนี้เป็นสมาชิกของร้านแล้ว",
            409,
          );
          assert(
            !(await tx.staffInvitation.count({
              where: { tenantId: ctx.tenant.id, email: input.email },
            })),
            "มีคำเชิญสำหรับอีเมลนี้แล้ว ใช้ส่งใหม่หรือยกเลิก",
            409,
          );
          const active = await tx.staffMember.count({
            where: {
              tenantId: ctx.tenant.id,
              OR: [
                { isActive: true },
                {
                  invitations: {
                    some: {
                      acceptedAt: null,
                      revokedAt: null,
                      expiresAt: { gt: new Date() },
                    },
                  },
                },
              ],
            },
          });
          assert(
            currentTenant.maxStaff < 0 || active < currentTenant.maxStaff,
            "พนักงานและคำเชิญเต็มโควตา",
            402,
          );
          const member = await tx.staffMember.create({
            data: {
              tenantId: ctx.tenant.id,
              displayName: input.displayName,
              role: input.role,
              isActive: false,
              pinCodeHash: "INVITATION_PENDING",
              branchAccess: {
                create: [...new Set(input.branchIds)].map((branchId) => ({
                  branchId,
                })),
              },
            },
          });
          invite = await tx.staffInvitation.create({
            data: {
              tenantId: ctx.tenant.id,
              staffId: member.id,
              email: input.email,
              invitedBy: ctx.session.user.id,
              tokenHash: tokenHash(newToken()),
              expiresAt: new Date(),
            },
          });
        } else {
          const { id } = z.object({ id: z.string() }).parse(body);
          invite = await tx.staffInvitation.findFirst({
            where: { id, tenantId: ctx.tenant.id },
          });
          assert(invite && !invite.acceptedAt, "ไม่พบคำเชิญที่แก้ไขได้", 404);
          if (action === "resend") {
            const occupied = await tx.staffMember.count({
              where: {
                tenantId: ctx.tenant.id,
                id: { not: invite.staffId },
                OR: [
                  { isActive: true },
                  {
                    invitations: {
                      some: {
                        acceptedAt: null,
                        revokedAt: null,
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ],
              },
            });
            assert(
              currentTenant.maxStaff < 0 || occupied < currentTenant.maxStaff,
              "พนักงานและคำเชิญเต็มโควตา",
              402,
            );
          }
          if (action === "revoke") {
            await tx.staffInvitation.update({
              where: { id: invite.id },
              data: { revokedAt: new Date() },
            });
            await tx.emailOutbox.updateMany({
              where: {
                dedupeKey: { startsWith: `invite:${invite.id}:` },
                sentAt: null,
              },
              data: { expiresAt: new Date() },
            });
            return { ok: true };
          }
          await tx.emailOutbox.updateMany({
            where: {
              dedupeKey: { startsWith: `invite:${invite.id}:` },
              sentAt: null,
            },
            data: { expiresAt: new Date() },
          });
        }
        const token = newToken(),
          expiresAt = new Date(Date.now() + 72 * 3600000);
        await tx.staffInvitation.update({
          where: { id: invite.id },
          data: { tokenHash: tokenHash(token), expiresAt, revokedAt: null },
        });
        await queueAccountMail(tx, {
          tenantId: ctx.tenant.id,
          to: invite.email,
          subject: `คำเชิญเข้าร้าน ${ctx.tenant.name} · BUZLIKE POS`,
          text: `คุณได้รับคำเชิญเข้าร้าน ${ctx.tenant.name}\nเข้าสู่ระบบหรือสมัครด้วยอีเมลนี้ แล้วตั้ง PIN ของคุณ\n${appLink(`/invite?token=${token}`)}\nลิงก์ใช้ได้ 72 ชั่วโมง หากไม่ได้เกี่ยวข้องให้ละเว้น`,
          dedupeKey: `invite:${invite.id}:${tokenHash(token)}`,
          expiresAt,
        });
        return { ok: true };
      });
    }
    assert(false, "ไม่พบรายการ", 404);
  });
}
