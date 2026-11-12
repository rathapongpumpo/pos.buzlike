import { NextResponse } from "next/server";
import { z } from "zod";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { sameOrigin, rateLimit } from "@/lib/security";
import {
  createGoogleLinkChallenge,
  googleConfigured,
  googleLinkCookie,
  googleLinkLifetime,
} from "@/lib/google-auth";

export async function POST(req: Request) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    assert(
      googleConfigured(),
      "การเข้าสู่ระบบด้วย Google ยังไม่เปิดให้ใช้งาน",
      503,
    );
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(1).max(128),
      })
      .parse(await req.json());
    await rateLimit(
      `google-link:ip:${req.headers.get("x-forwarded-for") ?? "local"}`,
      20,
      900000,
    );
    await rateLimit(`google-link:${body.email}`, 5, 900000);
    const token = await createGoogleLinkChallenge(body.email, body.password);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(googleLinkCookie(), token, {
      httpOnly: true,
      secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
      sameSite: "lax",
      path: "/",
      maxAge: googleLinkLifetime,
    });
    return response;
  });
}
