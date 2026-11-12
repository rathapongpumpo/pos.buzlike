// Disposable, loopback-only UI data. Never sends email or contacts a gateway.
import "dotenv/config";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";
import { activatePayment } from "../src/lib/billing";
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local UI fixture only");
const record = "output/playwright/phase3-fixture.json",
  state = "output/playwright/phase3-auth.json";
if (process.argv.includes("--cleanup")) {
  const f = JSON.parse(await readFile(record, "utf8"));
  const owner = await db.user.findUniqueOrThrow({ where: { id: f.userId } });
  if (
    !owner.email.startsWith("phase3-visual-") ||
    !owner.email.endsWith("@example.test")
  )
    throw new Error("Not a UI fixture owner");
  await db.emailOutbox.deleteMany({ where: { tenantId: f.tenantId } });
  await db.tenant.delete({ where: { id: f.tenantId } });
  await db.user.delete({ where: { id: f.userId } });
  await unlink(record);
  await unlink(state);
  console.log("Phase 3 UI fixture and authentication state removed");
} else {
  const id = randomUUID();
  const u = await db.user.create({
    data: {
      email: `phase3-visual-${id}@example.test`,
      fullName: "เจ้าของร้านทดสอบ",
    },
  });
  const t = await db.tenant.create({
    data: {
      name: "ร้านทดสอบหน้าสมาชิก",
      slug: `phase3-visual-${id.slice(0, 8)}`,
      ownerId: u.id,
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
    },
  });
  await db.$transaction((tx) =>
    provisionEmptyTenant(
      tx,
      t.id,
      "619472",
      u.id,
      "เจ้าของร้านทดสอบ",
      "",
      "NONE",
    ),
  );
  const p = await db.saasPayment.create({
    data: {
      tenantId: t.id,
      invoiceNumber: `INV-TEST-${id.slice(0, 8)}`,
      planCode: "STARTER_MONTHLY",
      amount: 199,
      vatAmount: 13.93,
      totalAmount: 212.93,
      paymentMethod: "BANK_SLIP",
      status: "PENDING",
    },
  });
  await db.$transaction((tx) => activatePayment(tx, p.id, t.id));
  await db.saasPayment.create({
    data: {
      tenantId: t.id,
      invoiceNumber: `INV-PENDING-${id.slice(0, 8)}`,
      planCode: "STARTER_MONTHLY",
      amount: 199,
      vatAmount: 13.93,
      totalAmount: 212.93,
      paymentMethod: "BANK_SLIP",
      status: "PENDING",
    },
  });
  const jwt = await encode({
    token: { sub: u.id, sessionVersion: 0 },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 3600,
  });
  await mkdir("output/playwright", { recursive: true });
  await writeFile(
    record,
    JSON.stringify({ userId: u.id, tenantId: t.id, slug: t.slug }),
  );
  await writeFile(
    state,
    JSON.stringify({
      cookies: [
        {
          name: "authjs.session-token",
          value: jwt,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
  console.log(JSON.stringify({ slug: t.slug, authState: state }));
}
await db.$disconnect();
