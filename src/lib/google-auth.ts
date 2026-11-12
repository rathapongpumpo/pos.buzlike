import { compare } from "bcryptjs";
import { z } from "zod";
import { db, serial } from "./db";
import { newToken, tokenHash, issueAccountToken } from "./account-tokens";
import { assert } from "./errors";

export const googleConfigured = () =>
  Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim(),
  );
export const googleLinkLifetime = 600;
export const googleLinkCookie = () =>
  process.env.AUTH_URL?.startsWith("https://")
    ? "__Host-buzlike-google-link"
    : "buzlike-google-link";

export class GoogleSignInError extends Error {
  constructor(
    public code:
      | "GoogleLinkRequired"
      | "GoogleLinkInvalid"
      | "GoogleIdentityConflict"
      | "GoogleUnverified",
  ) {
    super(code);
  }
}

export async function createGoogleLinkChallenge(
  email: string,
  password: string,
) {
  const user = await db.user.findUnique({ where: { email } });
  assert(
    user?.passwordHash && (await compare(password, user.passwordHash)),
    "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    401,
  );
  const token = newToken();
  await serial(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      current.passwordHash === user.passwordHash &&
        current.sessionVersion === user.sessionVersion,
      "บัญชีมีการเปลี่ยนแปลง กรุณายืนยันรหัสผ่านอีกครั้ง",
      409,
    );
    await tx.googleLinkChallenge.deleteMany({ where: { userId: user.id } });
    await tx.googleLinkChallenge.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        sessionVersion: current.sessionVersion,
        expiresAt: new Date(Date.now() + googleLinkLifetime * 1000),
      },
    });
  });
  return token;
}

// Called only after Auth.js validates Google's OIDC response, state and PKCE.
export async function resolveGoogleAccount(
  rawProfile: unknown,
  providerSubject: string,
  linkToken?: string,
  next?: string,
) {
  const parsed = z
    .object({
      sub: z.string().min(1).max(255),
      email: z.string().trim().toLowerCase().email().max(254),
      email_verified: z.literal(true),
      name: z.string().max(254).optional(),
      hd: z.string().trim().min(1).max(254).optional(),
    })
    .safeParse(rawProfile);
  if (!parsed.success || parsed.data.sub !== providerSubject)
    throw new GoogleSignInError("GoogleUnverified");
  const profile = parsed.data;
  // Google is not authoritative for third-party email addresses without Workspace.
  const authoritativeEmail =
    profile.email.endsWith("@gmail.com") || Boolean(profile.hd);
  return serial(async (tx) => {
    const identity = await tx.googleIdentity.findUnique({
      where: { subject: profile.sub },
      include: { user: true },
    });
    if (linkToken) {
      const challenge = await tx.googleLinkChallenge.findUnique({
        where: { tokenHash: tokenHash(linkToken) },
        include: { user: true },
      });
      if (
        !challenge ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.sessionVersion !== challenge.user.sessionVersion ||
        challenge.user.email.toLowerCase() !== profile.email
      )
        throw new GoogleSignInError("GoogleLinkInvalid");
      const alreadyLinked = await tx.googleIdentity.findUnique({
        where: { userId: challenge.userId },
      });
      if (
        (identity && identity.userId !== challenge.userId) ||
        (alreadyLinked && alreadyLinked.subject !== profile.sub)
      )
        throw new GoogleSignInError("GoogleIdentityConflict");
      await tx.googleIdentity.upsert({
        where: { subject: profile.sub },
        update: {},
        create: { subject: profile.sub, userId: challenge.userId },
      });
      const consumed = await tx.googleLinkChallenge.updateMany({
        where: {
          id: challenge.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new GoogleSignInError("GoogleLinkInvalid");
      const linkedUser = await tx.user.update({
        where: { id: challenge.userId },
        data: {
          emailVerifiedAt:
            challenge.user.emailVerifiedAt ??
            (authoritativeEmail ? new Date() : null),
          emailVerificationRequired: true,
        },
      });
      if (!linkedUser.emailVerifiedAt)
        await issueAccountToken(tx, linkedUser, "VERIFY_EMAIL", next);
      return linkedUser;
    }
    // Email changes at Google never switch the identity to another local owner.
    if (identity) return identity.user;
    const existing = await tx.user.findUnique({
      where: { email: profile.email },
    });
    if (existing) throw new GoogleSignInError("GoogleLinkRequired");
    const created = await tx.user.create({
      data: {
        email: profile.email,
        fullName: profile.name?.trim() || "เจ้าของร้าน",
        emailVerifiedAt: authoritativeEmail ? new Date() : null,
        emailVerificationRequired: true,
        googleIdentity: { create: { subject: profile.sub } },
      },
    });
    if (!created.emailVerifiedAt)
      await issueAccountToken(tx, created, "VERIFY_EMAIL", next);
    return created;
  });
}
