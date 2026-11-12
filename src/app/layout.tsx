import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, Sarabun, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SessionSync } from "@/components/account-controls";
const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});
const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-receipt",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  display: "swap",
});
export const viewport: Viewport = { themeColor: "#fff9f5" };
export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
  title: "BUZLIKE POS · ระบบขายหน้าร้าน",
  description: "ระบบ POS สำหรับร้านกาแฟ ร้านอาหาร และร้านค้าปลีก",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="th">
      <body className={`${thai.variable} ${sarabun.variable} ${mono.variable}`}>
        <SessionSync userId={session?.user?.id ?? null} />
        {children}
      </body>
    </html>
  );
}
