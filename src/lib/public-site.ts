import type { Metadata } from "next";
export const siteOrigin = "https://pos.buzlike.com";
export const supportEmail = "support@buzlike.com";
export const publicPages = [
  "/",
  "/pricing",
  "/about",
  "/support",
  "/privacy",
  "/terms",
] as const;
export function publicMetadata(
  path: (typeof publicPages)[number],
  title: string,
  description: string,
): Metadata {
  return {
    title: `${title} | BUZLIKE POS`,
    description,
    alternates: { canonical: new URL(path, siteOrigin).href },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "th_TH",
      siteName: "BUZLIKE POS",
      url: new URL(path, siteOrigin).href,
      title,
      description,
    },
  };
}
export function publicStructuredData() {
  const organization = "https://buzlike.com/#organization";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: "BUZLIKE SYSTEMS",
        url: "https://buzlike.com/",
        email: supportEmail,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: supportEmail,
          availableLanguage: ["th"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        name: "BUZLIKE POS",
        url: `${siteOrigin}/`,
        inLanguage: "th",
        publisher: { "@id": organization },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteOrigin}/#software`,
        name: "BUZLIKE POS",
        url: `${siteOrigin}/`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        inLanguage: "th",
        provider: { "@id": organization },
        description:
          "ระบบขายหน้าร้านสำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก จัดการสินค้า ราคา สต็อก พนักงาน และหลายสาขา",
        featureList: [
          "ขายหน้าร้านและใบเสร็จภาษาไทย",
          "สินค้า ราคา และส่วนลด",
          "สต็อกและรายงานยอดขาย",
          "สิทธิ์พนักงานและสาขา",
          "Pro: QR สั่งอาหาร จอครัว และสูตรวัตถุดิบ",
        ],
      },
    ],
  };
}
