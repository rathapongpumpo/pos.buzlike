import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { publicPages } from "@/lib/public-site";
import { isStoreScreen } from "@/lib/store-routes";
import { notFoundResponse } from "@/lib/not-found-response";
import { markdownPath, prefersMarkdown } from "@/lib/public-formats";
import {
  markdownResponse,
  publicRepresentationHeaders,
} from "@/lib/public-markdown";
const publicRoutes = new Set<string>([
  ...publicPages,
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/subscribe",
  "/pilot",
  "/pilot/invite",
  "/pilot/waitlist",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);
const publicFiles = new Set([
  "/favicon.svg",
  "/sw.js",
  "/feature-pos.png",
  "/feature-kitchen.png",
  "/feature-inventory.png",
  "/pos-concept.png",
  "/cafe-products.png",
  "/cafe-menu-sprite.png",
]);
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const markdownPage = publicPages.find((p) => markdownPath(p) === path);
  if (markdownPage) return markdownResponse(markdownPage, req.method);
  const publicPage = publicPages.find((p) => p === path);
  if (publicPage) {
    if (
      req.headers.get("rsc") !== "1" &&
      prefersMarkdown(req.headers.get("accept"))
    )
      return markdownResponse(publicPage, req.method);
    return publicRepresentationHeaders(NextResponse.next(), publicPage);
  }
  if (publicRoutes.has(path) || publicFiles.has(path))
    return NextResponse.next();
  if (/^\/m\/[^/]+$/.test(path)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  const accountRoute =
    path === "/onboarding" ||
    path === "/start" ||
    path === "/superadmin" ||
    path.startsWith("/superadmin/");
  if (!accountRoute) {
    const segments = path.slice(1).split("/");
    if (
      segments.length > 2 ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(segments[0]) ||
      (segments.length === 2 && !isStoreScreen(segments[1]))
    )
      return notFoundResponse();
    const tenant = await db.tenant.findUnique({
      where: { slug: segments[0] },
      select: { id: true },
    });
    if (!tenant) return notFoundResponse();
  }
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie:
      new URL(process.env.AUTH_URL ?? req.url).protocol === "https:",
  });
  if (!token?.sub) {
    const url = new URL("/login", req.url);
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)).*)"],
};
