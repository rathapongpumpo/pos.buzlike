import { createHmac, timingSafeEqual } from "node:crypto";
export function staffCookie(id: string, user: string, tenant: string) {
  const body = Buffer.from(
    JSON.stringify({ id, user, tenant, exp: Date.now() + 12 * 3600000 }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", process.env.AUTH_SECRET!).update(body).digest("base64url")}`;
}
export function verifyStaffCookie(value: string, user: string, tenant: string) {
  try {
    const [body, sig] = value.split(".");
    const expected = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(body)
      .digest("base64url");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.user === user && data.tenant === tenant && data.exp > Date.now()
      ? (data.id as string)
      : null;
  } catch {
    return null;
  }
}
