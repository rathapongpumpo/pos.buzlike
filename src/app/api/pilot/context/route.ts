import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { rateLimit, sameOrigin } from "@/lib/security";
import {
  invitationFromToken,
  bindPilotContext,
  encodePilotContext,
  pilotCookieName,
} from "@/lib/pilot-admission";
export async function POST(req: Request) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    await rateLimit(
      `pilot-context:${req.headers.get("x-forwarded-for") ?? "local"}`,
      30,
      900000,
    );
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await req.json());
    const invite = await invitationFromToken(token);
    const context = {
      invitationId: invite.id,
      tokenVersion: invite.tokenVersion,
    };
    const session = await auth();
    if (session?.user?.id) {
      const user = await db.user.findUniqueOrThrow({
        where: { id: session.user.id },
      });
      await serial((tx) => bindPilotContext(tx, user, context));
    }
    const maxAge = Math.max(
      1,
      Math.min(7 * 86400, Math.floor((+invite.expiresAt - Date.now()) / 1000)),
    );
    const response = NextResponse.json({ next: "/pilot" });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      pilotCookieName(),
      await encodePilotContext(context, maxAge),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
        path: "/",
        maxAge,
      },
    );
    return response;
  });
}
