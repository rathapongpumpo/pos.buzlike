import { isValidElement, type ReactNode } from "react";
import { db } from "./db";
import { publicDocuments } from "./public-documents";
import { publicPlanCards, pilotPricingNotice } from "./public-plan-cards";
import {
  publicPages,
  publicStructuredData,
  siteOrigin,
  supportEmail,
} from "./public-site";
import { contentSignal, markdownPath, mergeVary } from "./public-formats";
import { releasePolicy } from "./release-policy";

type PublicPath = (typeof publicPages)[number];
const escapeText = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");

// Only the application's own static public text nodes are serialized. No HTML fetch or session context.
function nodesToMarkdown(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number")
    return escapeText(String(node).replace(/\s+/g, " "));
  if (Array.isArray(node)) return node.map(nodesToMarkdown).join("");
  if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) return "";
  const children = nodesToMarkdown(node.props.children);
  const tag = node.type;
  if (tag === "a" && node.props.href)
    return `[${children}](${new URL(node.props.href, siteOrigin).href})`;
  if (tag === "strong" || tag === "b") return `**${children}**`;
  if (tag === "h2") return `\n\n## ${children}\n\n`;
  if (tag === "h3") return `\n\n### ${children}\n\n`;
  if (tag === "li") return `- ${children}\n`;
  if (tag === "p" || tag === "ul" || tag === "div")
    return `\n\n${children}\n\n`;
  return children;
}

async function catalogMarkdown() {
  const [policy, prices] = await Promise.all([
    releasePolicy(),
    db.plan.findMany({ select: { code: true, price: true } }),
  ]);
  const commerce =
    policy.releaseMode !== "PRIVATE_PILOT" && policy.checkoutMode === "PUBLIC";
  const notice = commerce
    ? "เปิดรับสมัครแพ็กเกจตามราคาและเงื่อนไขที่แสดงบนเว็บไซต์"
    : pilotPricingNotice;
  const cards = publicPlanCards(false).filter(
    (p) => commerce || p.code !== "LIFETIME_BUYOUT",
  );
  const annual = publicPlanCards(true);
  const amount = (code: string, fallback: number) =>
    Number(
      prices.find((p) => p.code === code)?.price ?? fallback,
    ).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const plans = cards
    .map((card) => {
      const yearly = annual.find((a) => a.name === card.name)!;
      const price =
        card.code === "LIFETIME_BUYOUT"
          ? `${amount(card.code, card.price)} บาท จ่ายครั้งเดียว`
          : `${amount(card.code, card.price)} บาท/เดือน หรือ ${amount(yearly.code, yearly.price)} บาท/ปี`;
      return `### ${card.name}\n\n${card.caption}\n\n${price}\n\n${card.features.map((f) => `- ${f}`).join("\n")}`;
    })
    .join("\n\n");
  return `## สถานะบริการและราคา\n\n${notice}\n\n${plans}\n\nราคาแพ็กเกจยังไม่รวม VAT 7%\n\n[ข้อกำหนดนำร่อง](${siteOrigin}/terms.md)`;
}

export async function publicMarkdown(path: PublicPath) {
  let body: string;
  if (path === "/" || path === "/pricing") {
    const facts = publicStructuredData()["@graph"].find(
      (n) => n["@type"] === "SoftwareApplication",
    )!;
    body = `# ${path === "/" ? "BUZLIKE POS" : "แพ็กเกจและราคา BUZLIKE POS"}\n\n> ${facts.description}\n\n`;
    if (path === "/")
      body += `## ฟีเจอร์\n\n${facts.featureList!.map((f) => `- ${f}`).join("\n")}\n\nร้านเริ่มจากข้อมูลว่าง เจ้าของร้านตั้งชื่อ เพิ่มสินค้า กำหนดราคาและส่วนลดได้เอง\n\n`;
    body += await catalogMarkdown();
  } else {
    const doc = publicDocuments[path];
    body = `# ${doc.title}\n\n${nodesToMarkdown(doc.body).trim()}`;
  }
  return (
    body +
    `\n\n## ข้อมูลเพิ่มเติม\n\n- [หน้าเว็บต้นฉบับ](${siteOrigin}${path})\n- [ดัชนีเอกสาร](${siteOrigin}/llms.txt)\n- [ติดต่อทีม](mailto:${supportEmail})\n`
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export async function markdownResponse(path: PublicPath, method: string) {
  if (method !== "GET" && method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  const body = await publicMarkdown(path);
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Signal": contentSignal,
    Link: `<${siteOrigin}${path}>; rel="canonical"; type="text/html", <${siteOrigin}/llms.txt>; rel="describedby"`,
    "X-Content-Type-Options": "nosniff",
  });
  mergeVary(headers, "Accept");
  return new Response(method === "HEAD" ? null : body, { headers });
}

export function publicRepresentationHeaders(
  response: Response,
  path: PublicPath,
) {
  mergeVary(response.headers, "Accept");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Content-Signal", contentSignal);
  response.headers.set(
    "Link",
    `<${siteOrigin}${markdownPath(path)}>; rel="alternate"; type="text/markdown", <${siteOrigin}/llms.txt>; rel="describedby"`,
  );
  return response;
}
