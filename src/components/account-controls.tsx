"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import { safeNext } from "@/lib/account-links";

export function SessionSync({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (document.visibilityState === "hidden" || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const session = await response.json();
        if (!active) return;
        const currentUser = session?.user?.id ?? null;
        if (currentUser && ["/login", "/register"].includes(pathname)) {
          window.location.replace(
            safeNext(new URLSearchParams(window.location.search).get("next")),
          );
        } else if (
          !currentUser &&
          (["/start", "/onboarding"].includes(pathname) ||
            /^\/superadmin(?:\/|$)/.test(pathname) ||
            /^\/[^/]+\/(start|dashboard|pos|cfd|products|inventory|tables|kds|orders|shifts|staff|settings|billing)$/.test(
              pathname,
            ))
        ) {
          window.location.replace("/login");
        } else if (currentUser !== userId) window.location.reload();
      } catch {
        // Offline screens keep their existing offline behavior.
      } finally {
        checking = false;
      }
    };
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("popstate", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("popstate", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [userId, pathname]);
  return null;
}

export function AccountSignOut({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="account-signout">
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            // Keep unsynced sales and held bills; remove cached account data.
            const { offline } = await import("@/lib/offline-queue");
            const keys = await offline.catalog
              .filter((row) => row.key.startsWith(`${userId}:`))
              .primaryKeys();
            await offline.catalog.bulkDelete(keys);
            if ("caches" in window) {
              for (const name of await caches.keys()) {
                if (name.startsWith("buzlike-pos-")) await caches.delete(name);
              }
            }
          } catch {
            // Storage restrictions must not prevent ending the server session.
          }
          try {
            await signOut({ redirect: false });
            // Stay on this origin, including local/test host aliases.
            window.location.href = "/";
          } catch {
            setError("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
            setBusy(false);
          }
        }}
      >
        {busy ? "กำลังออก…" : "ออกจากระบบ"}
      </Button>
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}
