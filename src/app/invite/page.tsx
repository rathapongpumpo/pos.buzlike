import { accountNavigation } from "@/lib/account-navigation";
import { AuthLayout } from "@/components/auth-layout";
import { InvitationForm } from "@/components/invitation-form";
export const metadata = { referrer: "no-referrer" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams,
    account = await accountNavigation();
  return (
    <AuthLayout>
      <InvitationForm
        token={token}
        account={
          account
            ? {
                userId: account.userId,
                email: account.email,
                needsVerification: account.needsVerification,
              }
            : null
        }
      />
    </AuthLayout>
  );
}
