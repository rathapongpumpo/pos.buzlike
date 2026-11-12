// Disposable local fixtures only. No mail, payments or existing business updates.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { encode } from "next-auth/jwt";
import { db } from "../src/lib/db";
import { provisionEmptyTenant, seedTenantTemplate } from "../src/lib/provision";
const directory = "output/playwright/responsive";
const manifest = `${directory}/fixture.json`;
assert(
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  ),
);
try {
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(await readFile(manifest, "utf8"));
    for (const id of fixture.userIds) {
      const u = await db.user.findUniqueOrThrow({ where: { id } });
      assert(
        u.email.startsWith("responsive-qa-") &&
          u.email.endsWith("@example.test"),
      );
      const owned = await db.tenant.findMany({
        where: { ownerId: id },
        select: { id: true },
      });
      assert(owned.every((t) => fixture.tenantIds.includes(t.id)));
      await db.$transaction(async (tx) => {
        const ids = owned.map((t) => t.id);
        await tx.order.deleteMany({ where: { tenantId: { in: ids } } });
        await tx.cashierShift.deleteMany({ where: { tenantId: { in: ids } } });
        await tx.tenant.deleteMany({ where: { id: { in: ids }, ownerId: id } });
        await tx.user.delete({ where: { id } });
      });
    }
    for (const name of ["owner", "admin", "verify"])
      await unlink(`${directory}/${name}-auth.json`);
    await db.rateLimit.deleteMany({
      where: { key: { startsWith: "invite-ip:preview:responsive-qa-ui-invite-" } },
    });
    await unlink(manifest);
    console.log("Responsive fixtures and session files removed");
  } else {
    await assert.rejects(
      readFile(manifest),
      "Clean up the existing fixture first",
    );
    await mkdir(directory, { recursive: true });
    const users = [];
    for (const role of ["owner", "admin", "verify"]) {
      const u = await db.user.create({
        data: {
          email: `responsive-qa-${randomUUID()}@example.test`,
          fullName: "ผู้ทดสอบการแสดงผลบนอุปกรณ์",
          systemRole: role === "admin" ? "SUPER_ADMIN" : "USER",
          emailVerificationRequired: role === "verify",
          emailVerifiedAt: role === "verify" ? null : new Date(),
        },
      });
      users.push(u);
      const token = await encode({
        token: {
          sub: u.id,
          email: u.email,
          name: u.fullName,
          sessionVersion: u.sessionVersion,
        },
        secret: process.env.AUTH_SECRET!,
        salt: "authjs.session-token",
        maxAge: 7200,
      });
      await writeFile(
        `${directory}/${role}-auth.json`,
        JSON.stringify({
          cookies: [
            {
              name: "authjs.session-token",
              value: token,
              domain: "localhost",
              path: "/",
              expires: Math.floor(Date.now() / 1000) + 7200,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }),
      );
    }
    const tenants = [];
    for (let index = 0; index < 2; index++) {
      const t = await db.tenant.create({
        data: {
          ownerId: users[0].id,
          name: index
            ? "ร้านค้าทดสอบสำหรับเลือกร้านอีกธุรกิจ"
            : "ร้านกาแฟทดสอบชื่อยาวสำหรับมือถือและแท็บเล็ต",
          slug: `responsive-qa-${randomUUID().slice(0, 8)}`,
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
          maxBranches: 3,
          enableKds: true,
          enableQrOrder: true,
          enableRecipeBom: true,
          enableExport: true,
        },
      });
      const branch = await db.$transaction(
        (tx) =>
          index
            ? provisionEmptyTenant(
                tx,
                t.id,
                "827146",
                users[0].id,
                "เจ้าของร้านทดสอบชื่อยาว",
                "",
                "NONE",
              )
            : seedTenantTemplate(
                tx,
                t.id,
                "CAFE_BEVERAGE",
                "827146",
                users[0].id,
                "เจ้าของร้านทดสอบชื่อยาว",
                "",
                "NONE",
              ),
        { timeout: 30000 },
      );
      if (!index) {
        await db.storeBranch.update({
          where: { id: branch.id },
          data: { name: "สาขาสำนักงานใหญ่สำหรับทดสอบชื่อยาว" },
        });
        const table = await db.diningTable.findFirst({
          where: { tenantId: t.id },
        });
        if (table)
          await db.diningTable.update({
            where: { id: table.id },
            data: {
              status: "OCCUPIED",
              activeQrToken: `responsive-qa-${randomUUID()}`,
            },
          });
      }
      tenants.push(t);
    }
    const table = await db.diningTable.findFirst({
      where: { tenantId: tenants[0].id, activeQrToken: { not: null } },
    });
    const result = {
      userIds: users.map((u) => u.id),
      tenantIds: tenants.map((t) => t.id),
      slug: tenants[0].slug,
      tableToken: table?.activeQrToken,
    };
    await writeFile(manifest, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        slug: result.slug,
        hasQr: !!result.tableToken,
        authStates: directory,
      }),
    );
  }
} finally {
  await db.$disconnect();
}
