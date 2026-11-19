import type { MetadataRoute } from "next";
import { publicPages, siteOrigin } from "@/lib/public-site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
        allow: [
          ...publicPages.map((path) => `${path}$`),
          "/_next/static/",
          "/feature-pos.png$",
          "/feature-kitchen.png$",
          "/feature-inventory.png$",
          "/favicon.svg$",
        ],
      },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
