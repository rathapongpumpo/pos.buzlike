import Link from "next/link";
import { AuthLayout } from "./auth-layout";
import { AccountSignOut } from "./account-controls";
export function PilotLayout({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  return (
    <AuthLayout variant="setup">
      <section className="auth-card pilot-card">
        <div className="pilot-toolbar">
          <Link href="/">กลับหน้าแรก</Link>
          {userId && <AccountSignOut userId={userId} />}
        </div>
        {children}
      </section>
    </AuthLayout>
  );
}
