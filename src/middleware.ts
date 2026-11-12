import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie:
      new URL(process.env.AUTH_URL ?? req.url).protocol === "https:",
  });
  if (!token?.sub) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = {
  runtime: "nodejs",
  matcher: [
    "/onboarding",
    "/start",
    "/superadmin/:path*",
    "/((?!api|_next|m/|login|register|pricing|pilot|favicon|.*\\.).+)/:screen",
  ],
};
