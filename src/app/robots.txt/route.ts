import { publicPages, siteOrigin } from "@/lib/public-site";
import { contentSignal, markdownPath } from "@/lib/public-formats";
export const dynamic = "force-static";
export function GET() {
  const allowed = [
    ...publicPages,
    ...publicPages.map(markdownPath),
    "/llms.txt",
    "/_next/static/",
    "/feature-pos.png",
    "/feature-kitchen.png",
    "/feature-inventory.png",
    "/favicon.svg",
  ];
  const body = [
    "User-Agent: *",
    `Content-Signal: ${contentSignal}`,
    "Disallow: /",
    ...allowed.map((p) => `Allow: ${p}${p === "/_next/static/" ? "" : "$"}`),
    "",
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
