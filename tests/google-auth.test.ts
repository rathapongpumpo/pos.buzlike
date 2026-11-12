import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
import {
  createGoogleLinkChallenge,
  resolveGoogleAccount,
} from "../src/lib/google-auth";
import { tokenHash, needsVerification } from "../src/lib/account-tokens";

const run = randomUUID(),
  prefix = `google-qa-${run}-`;
const password = "Google-QA-Password!";
let passwordHash = "";
before(async () => {
  passwordHash = await hash(password, 10);
});
const email = (name: string) => `${prefix}${name}@example.test`;
const profile = (name: string, overrides: Record<string, unknown> = {}) => ({
  sub: `${prefix}${name}`,
  email: email(name),
  email_verified: true,
  name: "Google QA",
  hd: "example.test",
  ...overrides,
});
const isCode = (code: string) => (e: any) => e.code === code;

test("Google: first verified identity creates one empty owner account; concurrent callbacks reuse it", async () => {
  const p = profile("new");
  const users = await Promise.all(
    Array.from({ length: 4 }, () => resolveGoogleAccount(p, p.sub)),
  );
  assert.equal(new Set(users.map((u) => u.id)).size, 1);
  const owner = users[0];
  assert.equal(owner.passwordHash, null);
  assert.equal(owner.systemRole, "USER");
  assert.ok(owner.emailVerifiedAt);
  assert.equal(needsVerification(owner), false);
  assert.equal(await db.tenant.count({ where: { ownerId: owner.id } }), 0);
  assert.equal(
    await db.googleIdentity.count({ where: { userId: owner.id } }),
    1,
  );
});

test("Google: third-party email requires mailbox verification before shop setup and pilot claims", async () => {
  const p = profile("external", { hd: undefined });
  const owner = await resolveGoogleAccount(
    p,
    p.sub,
    undefined,
    "/subscribe?plan=PRO_YEARLY",
  );
  assert.equal(owner.emailVerifiedAt, null);
  assert.equal(needsVerification(owner), true);
  assert.equal(
    await db.emailOutbox.count({
      where: { userId: owner.id, dedupeKey: { startsWith: "account:" } },
    }),
    1,
  );
  assert.equal((await resolveGoogleAccount(p, p.sub)).id, owner.id);
  assert.equal(await db.emailOutbox.count({ where: { userId: owner.id } }), 1);
});

test("Google: unverified, malformed and inconsistent OIDC identity cannot create an account", async () => {
  for (const p of [
    profile("bad", { email_verified: false }),
    profile("bad", { sub: "" }),
    profile("bad", { email: "invalid" }),
    profile("bad", { email_verified: "true" }),
  ]) {
    await assert.rejects(
      resolveGoogleAccount(p, p.sub),
      isCode("GoogleUnverified"),
    );
  }
  const p = profile("bad");
  await assert.rejects(
    resolveGoogleAccount(p, "different-sub"),
    isCode("GoogleUnverified"),
  );
  assert.equal(await db.user.count({ where: { email: email("bad") } }), 0);
});

test("Google: matching email alone never links an existing password account", async () => {
  const owner = await db.user.create({
    data: {
      email: email("existing"),
      fullName: "Original",
      passwordHash,
      sessionVersion: 3,
      selectedPlan: "PRO_YEARLY",
    },
  });
  const p = profile("existing");
  await assert.rejects(
    resolveGoogleAccount(p, p.sub),
    isCode("GoogleLinkRequired"),
  );
  assert.deepEqual(
    await db.user.findUnique({ where: { id: owner.id } }),
    owner,
  );
  assert.equal(
    await db.googleIdentity.count({ where: { userId: owner.id } }),
    0,
  );
  await assert.rejects(
    createGoogleLinkChallenge(p.email, "wrong-password"),
    /อีเมลหรือรหัสผ่าน/,
  );
  assert.equal(
    await db.googleLinkChallenge.count({ where: { userId: owner.id } }),
    0,
  );
});

test("Google: password-confirmed linking preserves owner, shops, roles and session version; grant is private and single-use", async () => {
  const p = profile("existing");
  const original = await db.user.findUniqueOrThrow({
    where: { email: p.email },
  });
  const tenant = await db.tenant.create({
    data: {
      name: "Existing shop",
      slug: `${prefix}shop`,
      ownerId: original.id,
      trialEndsAt: new Date(),
    },
  });
  try {
    const token = await createGoogleLinkChallenge(p.email, password);
    const challenge = await db.googleLinkChallenge.findUniqueOrThrow({
      where: { tokenHash: tokenHash(token) },
    });
    assert.notEqual(challenge.tokenHash, token);
    assert.equal(challenge.sessionVersion, 3);
    const user = await resolveGoogleAccount(p, p.sub, token);
    assert.equal(user.id, original.id);
    assert.equal(user.passwordHash, original.passwordHash);
    assert.equal(user.sessionVersion, 3);
    assert.equal(user.selectedPlan, "PRO_YEARLY");
    assert.equal(user.systemRole, original.systemRole);
    assert.deepEqual(
      await db.tenant.findUnique({ where: { id: tenant.id } }),
      tenant,
    );
    await assert.rejects(
      resolveGoogleAccount(p, p.sub, token),
      isCode("GoogleLinkInvalid"),
    );
    assert.equal((await resolveGoogleAccount(p, p.sub)).id, original.id);
  } finally {
    await db.tenant.delete({ where: { id: tenant.id } });
  }
});

test("Google: stable subject retains the original owner when Google email changes to another local account", async () => {
  const p = profile("existing");
  const original = await db.user.findUniqueOrThrow({
    where: { email: p.email },
  });
  const other = await db.user.create({
    data: { email: email("other"), fullName: "Other", passwordHash },
  });
  const user = await resolveGoogleAccount({ ...p, email: other.email }, p.sub);
  assert.equal(user.id, original.id);
  assert.equal(user.email, original.email);
  assert.deepEqual(
    await db.user.findUnique({ where: { id: other.id } }),
    other,
  );
});

test("Google: expired, revoked-by-password-reset and wrong-email challenges cannot link", async () => {
  const p = profile("challenge");
  const user = await db.user.create({
    data: { email: p.email, fullName: "Challenge", passwordHash },
  });
  const expired = await createGoogleLinkChallenge(p.email, password);
  await db.googleLinkChallenge.update({
    where: { tokenHash: tokenHash(expired) },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(
    resolveGoogleAccount(p, p.sub, expired),
    isCode("GoogleLinkInvalid"),
  );
  const revoked = await createGoogleLinkChallenge(p.email, password);
  await db.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  await assert.rejects(
    resolveGoogleAccount(p, p.sub, revoked),
    isCode("GoogleLinkInvalid"),
  );
  const wrongEmail = await createGoogleLinkChallenge(p.email, password);
  await assert.rejects(
    resolveGoogleAccount(
      { ...p, email: email("different") },
      p.sub,
      wrongEmail,
    ),
    isCode("GoogleLinkInvalid"),
  );
  assert.equal(
    await db.googleIdentity.count({ where: { userId: user.id } }),
    0,
  );
  const results = await Promise.allSettled([
    resolveGoogleAccount(p, p.sub, wrongEmail),
    resolveGoogleAccount(p, p.sub, wrongEmail),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});

test("Google: a different subject cannot replace a previously linked identity", async () => {
  const p = profile("existing");
  const token = await createGoogleLinkChallenge(p.email, password);
  await assert.rejects(
    resolveGoogleAccount(
      { ...p, sub: p.sub + "-imposter" },
      p.sub + "-imposter",
      token,
    ),
    isCode("GoogleIdentityConflict"),
  );
  const identity = await db.googleIdentity.findUniqueOrThrow({
    where: { subject: p.sub },
  });
  assert.equal((await resolveGoogleAccount(p, p.sub)).id, identity.userId);
});

test("Google HTTP: setup is closed without credentials and rejects cross-site linking", async () => {
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
  const response = await fetch(`${base}/api/auth/google-link`, {
    method: "POST",
    headers: {
      Origin: "https://outside.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: email("existing"), password }),
  });
  assert.equal(response.status, 403);
  const providers = await (await fetch(`${base}/api/auth/providers`)).json();
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    assert.equal(providers.google, undefined);
    const disabled = await fetch(`${base}/api/auth/google-link`, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email("existing"), password }),
    });
    assert.equal(disabled.status, 503);
  }
});

after(async () => {
  await db.emailOutbox.deleteMany({
    where: { user: { email: { startsWith: prefix } } },
  });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.$disconnect();
});
