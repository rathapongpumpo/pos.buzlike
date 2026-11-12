import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";
import { issueAccountToken } from "../src/lib/account-tokens";
import { decryptMail } from "../src/lib/email-outbox";
import { encode } from "next-auth/jwt";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local QA only");
const file = "output/phase2-browser-fixture.json";
if (process.argv[2] === "cleanup") {
  const fixture = JSON.parse(await readFile(file, "utf8"));
  const user = await db.user.findUniqueOrThrow({
    where: { id: fixture.userId },
  });
  if (
    user.email !== fixture.email ||
    !user.email.startsWith("browser-phase2-") ||
    !user.email.endsWith("@example.test")
  )
    throw new Error("Fixture identity mismatch");
  const tenants = await db.tenant.findMany({ where: { ownerId: user.id } });
  if (tenants.some((t) => !t.slug.startsWith("browser-phase2-")))
    throw new Error("Unexpected store; retain for inspection");
  for (const tenant of tenants) {
    await db.emailOutbox.deleteMany({ where: { tenantId: tenant.id } });
    await db.order.deleteMany({ where: { tenantId: tenant.id } });
    await db.cashierShift.deleteMany({ where: { tenantId: tenant.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
  await db.user.delete({ where: { id: user.id } });
  await writeFile(file, JSON.stringify({ cleanedUp: true }, null, 2));
  console.log("Phase 2 browser fixture cleaned up");
} else if (process.argv[2] === "links" || process.argv[2] === "invite") {
  const fixture = JSON.parse(await readFile(file, "utf8"));
  if (process.argv[2] === "invite") {
    const branch = await db.storeBranch.findFirstOrThrow({
      where: { tenant: { slug: fixture.slug } },
      orderBy: { id: "asc" },
    });
    const jwt = await encode({
      token: { sub: fixture.userId },
      secret: process.env.AUTH_SECRET!,
      salt: "authjs.session-token",
      maxAge: 3600,
    });
    const response = await fetch(
      "http://localhost:3100/api/invitations/create",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3100",
          Cookie: `authjs.session-token=${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeSlug: fixture.slug,
          branchId: branch.id,
          email: fixture.inviteEmail,
          displayName: "พนักงานสาขาหลัก",
          role: "CASHIER",
          branchIds: [branch.id],
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Local invite fixture failed: ${response.status}`);
  }
  const row = await db.emailOutbox.findFirstOrThrow({
    where: { to: fixture.inviteEmail, encryptedText: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  fixture.invitePath =
    new URL(decryptMail(row.encryptedText!).match(/http[^\s]+/)![0]).pathname +
    new URL(decryptMail(row.encryptedText!).match(/http[^\s]+/)![0]).search;
  await writeFile(file, JSON.stringify(fixture, null, 2));
  console.log("Local invitation link ready in private fixture manifest");
} else {
  const run = randomUUID(),
    email = `browser-phase2-${run}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      fullName: "เจ้าของร้านทดสอบเฟส 2",
      passwordHash: await hash("Browser-QA-2026-Only!", 12),
      emailVerificationRequired: true,
    },
  });
  const tenant = await db.tenant.create({
    data: {
      ownerId: user.id,
      name: "ร้านทดสอบบัญชีและทีมงาน",
      slug: `browser-phase2-${run}`,
      trialEndsAt: new Date(Date.now() + 86400000 * 14),
      maxBranches: 5,
      maxStaff: 20,
    },
  });
  await db.$transaction((tx) =>
    provisionEmptyTenant(
      tx,
      tenant.id,
      "827146",
      user.id,
      user.fullName,
      "",
      "NONE",
    ),
  );
  await db.storeBranch.create({
    data: { tenantId: tenant.id, name: "สาขาริมสวน" },
  });
  await db.$transaction(async (tx) => {
    await issueAccountToken(tx, user, "VERIFY_EMAIL");
    await issueAccountToken(tx, user, "PASSWORD_RESET");
  });
  const fixture: Record<string, string> = {
    userId: user.id,
    email,
    slug: tenant.slug,
    inviteEmail: `browser-phase2-staff-${run}@example.test`,
  };
  for (const [field, subject] of [
    ["verifyPath", "ยืนยันอีเมล BUZLIKE POS"],
    ["resetPath", "ตั้งรหัสผ่านใหม่ BUZLIKE POS"],
  ]) {
    const row = await db.emailOutbox.findFirstOrThrow({
      where: { userId: user.id, subject },
    });
    const url = new URL(
      decryptMail(row.encryptedText!).match(/http[^\s]+/)![0],
    );
    fixture[field] = url.pathname + url.search;
  }
  await mkdir("output", { recursive: true });
  await writeFile(file, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ email, slug: tenant.slug, manifest: file }));
}
await db.$disconnect();
