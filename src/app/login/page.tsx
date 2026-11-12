import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
import { accountNavigation } from "@/lib/account-navigation";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/account-links";
import { googleConfigured } from "@/lib/google-auth";
import { releasePolicy } from "@/lib/release-policy";
import { readPilotContext, validPilotInvitation } from "@/lib/pilot-admission";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const pilotMode =
    (await releasePolicy()).releaseMode === "PRIVATE_PILOT" ||
    ["/pilot", "/pilot/waitlist"].includes(params.next ?? "");
  const context = await readPilotContext();
  const invite =
    context && params.next !== "/pilot/waitlist"
      ? await validPilotInvitation(context).catch(() => null)
      : null;
  const pilotInvite = Boolean(invite);
  const next =
    !params.next && pilotMode
      ? pilotInvite
        ? "/pilot"
        : "/pilot/waitlist"
      : safeNext(params.next);
  const account = await accountNavigation();
  if (account)
    redirect(
      account.needsVerification
        ? `/verify-email?next=${encodeURIComponent(next)}`
        : params.next
          ? next
          : "/start",
    );
  return (
    <AuthLayout>
      <AuthForm
        next={next}
        google={googleConfigured()}
        authError={params.error}
        pilotMode={pilotMode}
        pilotInvite={pilotInvite}
        inviteEmail={invite?.normalizedEmail}
      />
    </AuthLayout>
  );
}
