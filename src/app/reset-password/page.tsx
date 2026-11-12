import { AuthLayout } from "@/components/auth-layout";
import { AccountRecovery } from "@/components/account-recovery";
export const metadata = { referrer: "no-referrer" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthLayout>
      <AccountRecovery mode="reset" token={token} />
    </AuthLayout>
  );
}
