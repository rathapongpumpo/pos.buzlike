import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Admin } from "@/components/admin";
export default async function Page() {
  const s = await auth();
  if (!s?.user?.id) redirect("/login");
  const user = await db.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (user.systemRole !== "SUPER_ADMIN")
    return (
      <main className="empty">
        <h1>ไม่มีสิทธิ์ผู้ดูแลแพลตฟอร์ม</h1>
      </main>
    );
  return <Admin />;
}
