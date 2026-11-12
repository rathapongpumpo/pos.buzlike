"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "./ui/button";
import { AccountSignOut } from "./account-controls";

type Account = { userId: string; href: string; label: string } | null;

export function MarketingHeader({
  account,
  entryHref = "/register",
  entryLabel = "ทดลองใช้งานฟรี",
}: {
  account: Account;
  entryHref?: string;
  entryLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header className="marketing-header">
      <nav
        className="marketing-nav"
        aria-label="เมนูหลัก"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <Link className="brand" href="/" aria-label="BUZLIKE POS หน้าแรก">
          BUZLIKE <b>POS</b>
        </Link>
        <button
          ref={toggle}
          type="button"
          className="marketing-menu-toggle"
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          aria-controls="marketing-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
          <span>เมนู</span>
        </button>
        <div className="marketing-menu" id="marketing-menu" data-open={open}>
          <div className="marketing-links">
            <Link href="/#features" onClick={() => setOpen(false)}>
              ฟีเจอร์
            </Link>
            <Link href="/#pricing" onClick={() => setOpen(false)}>
              แพ็กเกจและราคา
            </Link>
            <Link href="https://buzlike.com/">เกี่ยวกับเรา</Link>
          </div>
          <div className="marketing-actions">
            {account ? (
              <AccountSignOut userId={account.userId} />
            ) : (
              <Link className="btn ghost" href="/login">
                เข้าสู่ระบบ
              </Link>
            )}
            <Button asChild>
              <Link href={account?.href ?? entryHref}>
                {account?.label ?? entryLabel}
                <ArrowRight size={17} />
              </Link>
            </Button>
          </div>
        </div>
      </nav>
    </header>
  );
}
