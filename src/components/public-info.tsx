import Link from "next/link";
export function PublicInfo({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="info-shell">
      <header className="info-header">
        <Link className="brand" href="/">
          BUZLIKE <b>POS</b>
        </Link>
        <Link href="/">กลับหน้าแรก</Link>
      </header>
      <article className="info-content">
        <h1>{title}</h1>
        {children}
      </article>
      <nav className="info-links" aria-label="ข้อมูลบริการ">
        <Link href="/privacy">ความเป็นส่วนตัว</Link>
        <Link href="/terms">ข้อกำหนดนำร่อง</Link>
        <Link href="/support">ติดต่อและแจ้งปัญหา</Link>
      </nav>
    </main>
  );
}
