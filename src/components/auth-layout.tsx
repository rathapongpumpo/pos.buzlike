import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export function AuthLayout({
  children,
  variant = "account",
}: {
  children: React.ReactNode;
  variant?: "account" | "setup";
}) {
  return (
    <div
      className={`auth-layout ${variant === "setup" ? "setup-layout" : "account-layout"}`}
    >
      <aside className="auth-aside">
        <header className="auth-brand-row">
          <Link href="/" className="brand">
            BUZLIKE <b>POS</b>
          </Link>
          {variant === "account" && (
            <Link href="/" className="auth-home-link">
              <ArrowLeft size={16} aria-hidden="true" />
              หน้าหลัก
            </Link>
          )}
        </header>
        <div>
          <h2>
            รับออเดอร์ให้ไว
            <br />
            ดูแลร้านให้ง่ายขึ้น
          </h2>
          <p>
            หน้าร้าน · ครัว · สต็อก · ยอดขาย
            <br />
            เชื่อมทุกงานของร้านไว้ในที่เดียว
          </p>
        </div>
        <small>BUZLIKE SmartPOS Cloud & Lifetime Suite</small>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
