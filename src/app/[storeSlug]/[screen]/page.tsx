import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { context, feature } from "@/lib/license-guard";
import { AppError } from "@/lib/errors";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { isStoreScreen } from "@/lib/store-routes";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; screen: string }>;
  searchParams: Promise<{ branchId?: string }>;
}) {
  const { storeSlug, screen } = await params;
  if (!isStoreScreen(screen)) notFound();
  const roles =
    screen === "billing" || screen === "settings"
      ? ["OWNER"]
      : ["products", "inventory", "staff", "dashboard"].includes(screen)
        ? ["OWNER", "MANAGER"]
        : screen === "kds"
          ? ["OWNER", "MANAGER", "KITCHEN"]
          : screen === "tables"
            ? ["OWNER", "MANAGER", "WAITER", "CASHIER"]
            : screen === "cfd"
              ? ["OWNER", "MANAGER", "CASHIER"]
              : screen === "start" || screen === "feedback"
                ? undefined
                : ["OWNER", "MANAGER", "CASHIER"];
  let ctx;
  try {
    ctx = await context(
      storeSlug,
      roles as never,
      false,
      (await searchParams).branchId,
    );
    if (screen === "kds") feature(ctx.tenant, "enableKds");
    if (screen === "tables") feature(ctx.tenant, "enableQrOrder");
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    if (e instanceof AppError && e.status === 404) notFound();
    if (e instanceof AppError)
      return (
        <main className="empty">
          <h1>{e.message}</h1>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: 25 }}
          >
            {e.status === 402 && ctx?.staff.role === "OWNER" && (
              <Button asChild>
                <Link href={`/${storeSlug}/billing`}>ดูแพ็กเกจ</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/start?switch=1">เลือกร้านของคุณ</Link>
            </Button>
          </div>
        </main>
      );
    throw e;
  }
  if (screen === "start") {
    const needsProducts =
      ["OWNER", "MANAGER"].includes(ctx.staff.role) &&
      !(await db.product.count({ where: { tenantId: ctx.tenant.id } }));
    redirect(
      `/${storeSlug}/${needsProducts ? "products" : ctx.staff.role === "KITCHEN" ? "kds" : ctx.staff.role === "WAITER" ? "tables" : "pos"}?branchId=${ctx.branch.id}`,
    );
  }
  return (
    <AppShell
      slug={storeSlug}
      screen={screen}
      userId={ctx.session.user.id}
      initialBranchId={ctx.branch.id}
      operatorId={ctx.staff.id}
    />
  );
}
