import { auth } from "@/auth";
import { AuthLayout } from "@/components/auth-layout";
import { AccountRecovery } from "@/components/account-recovery";
import { AccountSignOut } from "@/components/account-controls";
export const metadata = { referrer: "no-referrer" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const session = await auth(),
    params = await searchParams;
  return (
    <AuthLayout>
      {session?.user?.id && (
        <div className="setup-account-bar recovery-account-bar">
          <span>บัญชีของคุณ</span>
          <AccountSignOut userId={session.user.id} />
        </div>
      )}
      <AccountRecovery
        mode="verify"
        token={params.token}
        next={params.next}
        email={session?.user?.email ?? ""}
        signedIn={!!session?.user?.id}
      />
    </AuthLayout>
  );
}
