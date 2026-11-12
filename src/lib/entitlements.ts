import type {
  Tenant,
  PilotEnrollment,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { z } from "zod";
import { db } from "./db";

// A versioned grant, not a paid Plan or a mutable reference to the current price catalog.
export const PILOT_PRO_V1 = Object.freeze({
  profile: "PILOT_PRO_V1",
  maxBranches: 3,
  maxTerminals: -1,
  maxProducts: -1,
  maxStaff: -1,
  enableKds: true,
  enableQrOrder: true,
  enableRecipeBom: true,
  enableExport: true,
});
export const pilotSnapshotSchema = z
  .object({
    profile: z.literal("PILOT_PRO_V1"),
    maxBranches: z.literal(3),
    maxTerminals: z.literal(-1),
    maxProducts: z.literal(-1),
    maxStaff: z.literal(-1),
    enableKds: z.literal(true),
    enableQrOrder: z.literal(true),
    enableRecipeBom: z.literal(true),
    enableExport: z.literal(true),
  })
  .strict();
export type BaseState = Pick<
  Tenant,
  "subscriptionStatus" | "trialEndsAt" | "currentPeriodEndsAt"
> &
  Partial<Pick<Tenant, "cancelAtPeriodEnd">>;
export function subscriptionState(t: BaseState, now = Date.now()) {
  if (
    ["SUSPENDED", "READ_ONLY", "LIFETIME_ACTIVE"].includes(t.subscriptionStatus)
  )
    return t.subscriptionStatus;
  if (t.subscriptionStatus === "TRIALING")
    return +t.trialEndsAt <= now ? "READ_ONLY" : "TRIALING";
  if (t.currentPeriodEndsAt && +t.currentPeriodEndsAt <= now)
    return t.cancelAtPeriodEnd || now - +t.currentPeriodEndsAt > 3 * 86400000
      ? "READ_ONLY"
      : "PAST_DUE";
  return t.subscriptionStatus;
}
export type EntitlementInfo = {
  source: "BASE" | "PILOT" | "PAID";
  profile: string | null;
  state: ReturnType<typeof subscriptionState>;
  endsAt: Date | null;
};
export function resolveEntitlements(
  t: Tenant,
  grant: PilotEnrollment | null,
  now = Date.now(),
): { tenant: Tenant; entitlement: EntitlementInfo } {
  const base = subscriptionState(t, now);
  const paid =
    t.isLifetime ||
    (t.planCode !== "FREE_TRIAL" &&
      ["ACTIVE", "PAST_DUE", "LIFETIME_ACTIVE"].includes(base));
  const info: EntitlementInfo = {
    source: paid ? "PAID" : "BASE",
    profile: null,
    state: base,
    endsAt: t.planCode === "FREE_TRIAL" ? t.trialEndsAt : t.currentPeriodEndsAt,
  };
  if (
    base === "SUSPENDED" ||
    t.subscriptionStatus === "READ_ONLY" ||
    paid ||
    !grant?.activatedAt ||
    grant.tenantId !== t.id ||
    grant.ownerId !== t.ownerId
  )
    return { tenant: t, entitlement: info };
  const parsed = pilotSnapshotSchema.safeParse(grant.entitlementsSnapshot);
  const active =
    parsed.success &&
    grant.status === "ACTIVE" &&
    +grant.activatedAt <= now &&
    !!grant.endsAt &&
    +grant.endsAt > now;
  const state = active ? "ACTIVE" : "READ_ONLY";
  const { profile: _profile, ...features } = PILOT_PRO_V1;
  return {
    // This is a request-scoped view. Never persist these fields onto the paid subscription.
    tenant: {
      ...t,
      ...features,
      planCode: "PRO_MONTHLY",
      subscriptionStatus: state,
      currentPeriodEndsAt: grant.endsAt,
    },
    entitlement: {
      source: "PILOT",
      profile: "PILOT_PRO_V1",
      state,
      endsAt: grant.endsAt,
    },
  };
}
type Reader = Prisma.TransactionClient | PrismaClient;
export async function effectiveTenant(
  t: Tenant,
  client: Reader = db,
  now?: number,
) {
  const grant = await client.pilotEnrollment.findFirst({
    where: { tenantId: t.id, activatedAt: { not: null } },
    orderBy: { activatedAt: "desc" },
  });
  const clock =
    now ??
    (grant
      ? +(
          await client.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`
        )[0].now
      : Date.now());
  return resolveEntitlements(t, grant, clock);
}
export async function effectiveTenantById(
  id: string,
  client: Reader = db,
  now?: number,
) {
  return effectiveTenant(
    await client.tenant.findUniqueOrThrow({ where: { id } }),
    client,
    now,
  );
}
