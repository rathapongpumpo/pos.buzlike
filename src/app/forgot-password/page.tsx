import { AuthLayout } from "@/components/auth-layout";
import { AccountRecovery } from "@/components/account-recovery";
export default function Page() {
  return (
    <AuthLayout>
      <AccountRecovery mode="forgot" />
    </AuthLayout>
  );
}
