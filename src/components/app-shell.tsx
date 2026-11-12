"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Home,
  ShoppingCart,
  ReceiptText,
  Package,
  Boxes,
  Armchair,
  ChefHat,
  Wallet,
  Users,
  Settings,
  Layers,
  Store,
  RefreshCw,
  UserRound,
  Monitor,
  MessageSquare,
} from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import { offline, syncQueue, type QueuedSale } from "@/lib/offline-queue";
import { offlineScope } from "@/lib/offline-scope";
import { saleAccessBlocked } from "@/lib/pilot-access";
import type { Bootstrap } from "@/lib/view-types";
import { StoreContext } from "./store-context";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import { PinPad } from "./ui/pin-pad";
import { AccountSignOut } from "./account-controls";
import { PosTerminal } from "./pos/terminal";
import { Dashboard } from "./backoffice/dashboard";
import { Products } from "./backoffice/products";
import { Inventory } from "./backoffice/inventory";
import { Tables } from "./backoffice/tables";
import { Kitchen } from "./backoffice/kitchen";
import { Orders } from "./backoffice/orders";
import { Shifts } from "./backoffice/shifts";
import { Staff } from "./backoffice/staff";
import { StoreSettings } from "./backoffice/settings";
import { Billing } from "./backoffice/billing";
import { Feedback } from "./backoffice/feedback";
import { CustomerDisplay } from "./pos/customer-display";
import { useCart } from "@/lib/cart-store";
const links = [
  ["dashboard", "ภาพรวม", Home],
  ["pos", "ขายหน้าร้าน", ShoppingCart],
  ["orders", "รายการขาย", ReceiptText],
  ["products", "สินค้า", Package],
  ["inventory", "คลังวัตถุดิบ", Boxes],
  ["tables", "ผังโต๊ะ", Armchair],
  ["kds", "จอครัว", ChefHat],
  ["shifts", "เปิด–ปิดกะ", Wallet],
  ["staff", "พนักงาน", Users],
  ["settings", "ตั้งค่า", Settings],
  ["billing", "แพ็กเกจ", Layers],
  ["feedback", "แจ้งปัญหา", MessageSquare],
] as const;
export function AppShell({
  slug,
  screen,
  userId,
  initialBranchId,
  operatorId,
}: {
  slug: string;
  screen: string;
  userId: string;
  initialBranchId: string;
  operatorId: string;
}) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [branchId, setBranchId] = useState(initialBranchId),
    [availableBranches, setAvailableBranches] = useState<Bootstrap["branches"]>(
      [],
    ),
    [toast, setToast] = useState(""),
    [pin, setPin] = useState(false),
    [pinError, setPinError] = useState(""),
    [operatorPin, setOperatorPin] = useState(""),
    [pinBusy, setPinBusy] = useState(false),
    [sessionExpired, setSessionExpired] = useState(false),
    [legacyQueue, setLegacyQueue] = useState<QueuedSale[]>([]),
    [reviewLegacy, setReviewLegacy] = useState<QueuedSale | null>(null),
    [legacyAccepted, setLegacyAccepted] = useState(false),
    [queue, setQueue] = useState<
      { id: string; status: string; error?: string }[]
    >([]);
  const terminalKey = `${userId}:${slug}`;
  const namespace = offlineScope(userId, slug, branchId, operatorId);
  const scopeRef = useRef(namespace);
  const requestSequence = useRef(0);
  useEffect(() => {
    if (data?.entitlement?.source !== "PILOT") return;
    const check = () =>
      setData((current) =>
        current &&
        saleAccessBlocked(current) &&
        !["READ_ONLY", "SUSPENDED"].includes(current.state)
          ? {
              ...current,
              state: "READ_ONLY",
              tenant: { ...current.tenant, subscriptionStatus: "READ_ONLY" },
            }
          : current,
      );
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [data?.entitlement?.source, data?.entitlement?.endsAt]);
  scopeRef.current = namespace;
  useEffect(() => {
    const onBack = () => {
      const requested = new URL(window.location.href).searchParams.get(
        "branchId",
      );
      if (
        requested &&
        requested !== branchId &&
        availableBranches.some((branch) => branch.id === requested)
      ) {
        setData(null);
        setQueue([]);
        setLegacyQueue([]);
        setError("");
        setBranchId(requested);
      }
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [branchId, availableBranches]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("branchId", branchId);
    url.searchParams.set("scope", `${userId}:${operatorId}`);
    window.history.replaceState(window.history.state, "", url);
    if (screen === "pos" && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then(async (registration) => {
          const worker = registration.active ?? registration.installing;
          worker?.postMessage({ type: "CACHE_POS", url: window.location.href });
        })
        .catch(() => {});
  }, [screen, branchId, userId, operatorId]);
  const notify = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await api<Bootstrap>(
        `/api/v1/${slug}/bootstrap${branchId ? "?branchId=" + branchId : ""}`,
      );
      if (
        scopeRef.current !== namespace ||
        sequence !== requestSequence.current
      )
        return;
      if (result.staff.id !== operatorId) {
        window.location.href = `/${slug}/start?branchId=${result.branch.id}`;
        return;
      }
      if (result.branch.id !== branchId)
        throw new Error("ข้อมูลสาขาไม่ตรงกับสาขาที่เลือก");
      setData(result);
      setAvailableBranches(result.branches);
      setError("");
      setSessionExpired(false);
      await offline.catalog.put({ key: namespace, data: result });
    } catch (e) {
      if (
        scopeRef.current !== namespace ||
        sequence !== requestSequence.current
      )
        return;
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setSessionExpired(true);
        setError("การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
      } else if (e instanceof ApiError && [403, 404].includes(e.status)) {
        setData(null);
        setError((e as Error).message);
      } else if (!navigator.onLine) {
        const cached = await offline.catalog.get(namespace);
        if (
          cached &&
          cached.data.branch.id === branchId &&
          cached.data.staff.id === operatorId &&
          cached.data.tenant.slug === slug
        )
          setData(cached.data);
        else setError("ยังไม่มีข้อมูลออฟไลน์ กรุณาเชื่อมต่ออินเทอร์เน็ตก่อน");
      } else setError((e as Error).message);
    }
  }, [slug, namespace, branchId, operatorId]);
  const action = useCallback(
    async <T,>(path: string, body: unknown): Promise<T> => {
      let terminalId = localStorage.getItem("buzlike-terminal:" + terminalKey);
      if (!terminalId) {
        terminalId = crypto.randomUUID();
        localStorage.setItem("buzlike-terminal:" + terminalKey, terminalId);
      }
      const result = await api<T>(`/api/v1/${slug}/${path}`, {
        terminalId,
        ...(body as object),
        branchId: branchId || data?.branch.id,
      });
      await refresh();
      return result;
    },
    [slug, branchId, data?.branch.id, refresh, terminalKey],
  );
  useEffect(() => {
    void refresh();
    const status = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void syncQueue(namespace).then(() => refresh());
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    const timer = setInterval(() => {
      void offline.queue
        .where("key")
        .equals(terminalKey)
        .toArray()
        .then((rows) => {
          if (scopeRef.current === namespace)
            setLegacyQueue(
              rows.filter((row) => row.input.branchId === branchId),
            );
        });
      void offline.queue
        .where("key")
        .equals(namespace)
        .toArray()
        .then((rows) => {
          if (scopeRef.current === namespace) setQueue(rows);
        });
      if (navigator.onLine) void syncQueue(namespace);
    }, 4000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, [refresh, namespace, terminalKey, branchId]);
  useEffect(() => {
    if (!online) return;
    const source = new EventSource(
      `/api/v1/${slug}/events${branchId ? "?branchId=" + branchId : ""}`,
    );
    source.onmessage = () => void refresh();
    return () => source.close();
  }, [slug, branchId, refresh, online]);
  const roles = data?.staff.role;
  const cartLines = useCart((state) => state.lines);
  const selectBranch = (value: string) => {
    if (cartLines.length) {
      notify("กรุณาชำระหรือพักบิลก่อนเปลี่ยนสาขา");
      return;
    }
    setData(null);
    setQueue([]);
    setLegacyQueue([]);
    setError("");
    setBranchId(value);
  };
  const visibleLinks = links.filter(
    ([key]) =>
      ((key === "feedback" && data?.entitlement?.source === "PILOT") ||
        (key !== "feedback" &&
          (roles === "OWNER" ||
            (roles === "MANAGER" && !["settings", "billing"].includes(key)) ||
            (roles === "CASHIER" &&
              ["pos", "orders", "shifts"].includes(key)) ||
            (roles === "KITCHEN" && key === "kds") ||
            (roles === "WAITER" && key === "tables")))) &&
      (key !== "kds" || data?.tenant.enableKds) &&
      (key !== "tables" || data?.tenant.enableQrOrder) &&
      (key !== "inventory" || data?.tenant.enableRecipeBom),
  );
  if (!data)
    return (
      <main className="empty">
        <h1
          className="brand"
          style={{ justifyContent: "center", marginBottom: 25 }}
        >
          BUZLIKE <b>POS</b>
        </h1>
        <p>{error || "กำลังเตรียมร้านของคุณ…"}</p>
        {availableBranches.length > 1 && (
          <select
            aria-label="เลือกสาขา"
            value={branchId}
            onChange={(e) => selectBranch(e.target.value)}
          >
            {availableBranches.map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        )}
        {error && <Link href="/start?switch=1">กลับไปเลือกร้าน</Link>}
        {sessionExpired ? (
          <Button asChild className="section-space">
            <Link href="/login">เข้าสู่ระบบอีกครั้ง</Link>
          </Button>
        ) : (
          error && (
            <Button className="section-space" onClick={() => void refresh()}>
              ลองอีกครั้ง
            </Button>
          )
        )}
      </main>
    );
  const content =
    screen === "dashboard" ? (
      <Dashboard />
    ) : screen === "pos" ? (
      <PosTerminal />
    ) : screen === "products" ? (
      <Products />
    ) : screen === "inventory" ? (
      <Inventory />
    ) : screen === "tables" ? (
      <Tables />
    ) : screen === "kds" ? (
      <Kitchen />
    ) : screen === "orders" ? (
      <Orders />
    ) : screen === "shifts" ? (
      <Shifts />
    ) : screen === "staff" ? (
      <Staff />
    ) : screen === "settings" ? (
      <StoreSettings />
    ) : screen === "billing" ? (
      <Billing />
    ) : screen === "feedback" ? (
      <Feedback key={namespace} />
    ) : (
      <CustomerDisplay />
    );
  const ctx = {
    data,
    slug,
    namespace,
    terminalKey,
    online,
    refresh,
    action,
    notify,
  };
  if (screen === "cfd")
    return <StoreContext.Provider value={ctx}>{content}</StoreContext.Provider>;
  return (
    <StoreContext.Provider value={ctx}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link
            href={`/${slug}/start?branchId=${data.branch.id}`}
            className="brand"
          >
            BUZLIKE <b>POS</b>
          </Link>
          <nav>
            {visibleLinks.map(([key, label, Icon]) => (
              <Link
                key={key}
                className={`nav-link ${screen === key ? "active" : ""}`}
                title={label}
                href={`/${slug}/${key}?branchId=${data.branch.id}`}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-footer">
            <a href="https://buzlike.com/">BUZLIKE SYSTEMS</a>
            <p>SmartPOS Cloud & Lifetime</p>
          </div>
        </aside>
        <header className="app-header">
          <div className="row">
            <Store size={25} />
            <Link
              href="/start?switch=1"
              className="store-title"
              aria-label={`เลือกร้าน: ${data.tenant.name}`}
            >
              <strong>{data.tenant.name}</strong>
            </Link>
          </div>
          <div className="row">
            <span className={`online ${online ? "" : "offline"}`}>
              {online ? "ออนไลน์" : "ออฟไลน์"}
            </span>
            <button
              className="operator"
              onClick={() => {
                setPinError("");
                setOperatorPin("");
                setPin(true);
              }}
              aria-label="สลับพนักงาน"
            >
              <span className="avatar">{data.staff.displayName[0]}</span>
              <span className="operator-name">{data.staff.displayName}</span>
            </button>
            <AccountSignOut userId={userId} />
          </div>
        </header>
        <div className="branch-toolbar">
          <label htmlFor="branch-picker">สาขาที่กำลังใช้งาน</label>
          <select
            id="branch-picker"
            aria-label="เลือกสาขา"
            value={data.branch.id}
            onChange={(e) => selectBranch(e.target.value)}
          >
            {data.branches.map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
        {(data.entitlement?.source === "PILOT" ||
          (data.state !== "ACTIVE" && data.state !== "LIFETIME_ACTIVE")) && (
          <div
            className={`trial-banner ${data.entitlement?.source === "PILOT" ? "pilot-banner" : ""} ${data.state === "PAST_DUE" || data.state === "READ_ONLY" ? "warning" : ""}`}
          >
            <span>
              {data.entitlement?.source === "PILOT"
                ? data.state === "ACTIVE"
                  ? `Pro นำร่อง · ใช้ได้ถึง ${new Date(data.entitlement.endsAt!).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })} น.`
                  : "สิทธิ์นำร่องสิ้นสุด · เจ้าของร้านดูและส่งออกรายงานย้อนหลังได้"
                : data.state === "TRIALING"
                  ? `ทดลองใช้ฟรีเหลืออีก ${Math.max(0, Math.ceil((+new Date(data.tenant.trialEndsAt) - Date.now()) / 86400000))} วัน`
                  : data.state === "PAST_DUE"
                    ? "เลยกำหนดชำระ อยู่ในระยะผ่อนผัน 3 วัน"
                    : "แพ็กเกจหมดอายุ · เข้าดูและส่งออกรายงานย้อนหลังได้"}
            </span>
            <div
              className={
                data.entitlement?.source === "PILOT"
                  ? "pilot-banner-actions"
                  : "trial-banner-actions"
              }
            >
              {roles === "OWNER" ? (
                <Link href={`/${slug}/billing?branchId=${data.branch.id}`}>
                  {data.entitlement?.source === "PILOT"
                    ? "ดูสิทธิ์นำร่อง"
                    : data.release?.checkoutAvailable === false
                      ? "ดูสิทธิ์ร้าน"
                      : "อัปเกรดแพ็กเกจ"}
                </Link>
              ) : (
                <span>ติดต่อเจ้าของร้านเพื่อจัดการแพ็กเกจ</span>
              )}
              {data.entitlement?.source === "PILOT" && (
                <Link href={`/${slug}/feedback?branchId=${data.branch.id}`}>
                  แจ้งปัญหา
                </Link>
              )}
            </div>
          </div>
        )}
        <main className="app-main">
          {error && (
            <p className="error" style={{ marginBottom: 15 }}>
              {error}
            </p>
          )}
          {queue.length > 0 && (
            <div className="notice warning queue-notice">
              <div className="row between wrap">
                <span>
                  {queue.filter((q) => q.status === "pending").length}{" "}
                  บิลรอซิงก์ ·{" "}
                  {queue.filter((q) => q.status === "conflict").length}{" "}
                  บิลต้องตรวจสอบ
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await syncQueue(namespace);
                    setQueue(
                      await offline.queue
                        .where("key")
                        .equals(namespace)
                        .toArray(),
                    );
                    await refresh();
                  }}
                >
                  <RefreshCw size={14} />
                  ซิงก์
                </Button>
              </div>
              {queue
                .filter((q) => q.status === "conflict")
                .map((q) => (
                  <div key={q.id}>
                    <small>
                      {q.id.slice(0, 8)}: {q.error}
                    </small>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await offline.queue.update(q.id, { status: "pending" });
                        await syncQueue(namespace);
                        setQueue(
                          await offline.queue
                            .where("key")
                            .equals(namespace)
                            .toArray(),
                        );
                        await refresh();
                      }}
                    >
                      ลองซิงก์อีกครั้ง
                    </Button>
                  </div>
                ))}
            </div>
          )}
          {content}
          {["OWNER", "MANAGER"].includes(data.staff.role) &&
            legacyQueue.length > 0 && (
              <div className="notice warning section-space">
                <p>
                  มีบิลจากรุ่นเดิมในสาขานี้ {legacyQueue.length} บิล
                  ต้องตรวจผู้ขายก่อนส่ง ระบบยังเก็บข้อมูลไว้ครบ
                </p>
                {legacyQueue.map((row) => (
                  <Button
                    key={row.id}
                    variant="outline"
                    onClick={() => {
                      setReviewLegacy(row);
                      setLegacyAccepted(false);
                    }}
                  >
                    ตรวจบิล {row.id.slice(0, 8)}
                  </Button>
                ))}
              </div>
            )}
        </main>
      </div>
      <Modal
        title="ตรวจบิลจากรุ่นเดิม"
        open={reviewLegacy !== null}
        onClose={() => setReviewLegacy(null)}
      >
        {reviewLegacy && (
          <div className="stack">
            <p>
              สาขา: {data.branch.name} · ผู้ขายที่จะบันทึก:{" "}
              {data.staff.displayName}
            </p>
            <p>
              ยอดเดิม:{" "}
              {reviewLegacy.input.expectedGrandTotal ?? "ตรวจจากรายการสินค้า"}{" "}
              บาท
            </p>
            <ul>
              {reviewLegacy.input.items.map((item, index) => (
                <li key={index}>
                  {data.products.find(
                    (product) => product.id === item.productId,
                  )?.name ?? item.productId}{" "}
                  × {item.quantity}
                </li>
              ))}
            </ul>
            <label className="check">
              <input
                type="checkbox"
                checked={legacyAccepted}
                onChange={(event) => setLegacyAccepted(event.target.checked)}
              />
              ยืนยันว่าบิลนี้เป็นของสาขาและพนักงานข้างต้น
            </label>
            <Button
              disabled={!legacyAccepted}
              onClick={async () => {
                await offline.queue.update(reviewLegacy.id, {
                  key: namespace,
                  input: { ...reviewLegacy.input, operatorId: data.staff.id },
                  status: "pending",
                  error: undefined,
                });
                setReviewLegacy(null);
                await syncQueue(namespace);
                await refresh();
              }}
            >
              ยืนยันและส่งบิลเดิม
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        title="สลับผู้ปฏิบัติงาน"
        open={pin}
        onClose={() => {
          if (!pinBusy) {
            setPin(false);
            setOperatorPin("");
          }
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (pinBusy || operatorPin.length < 4) return;
            setPinError("");
            setPinBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              await action("pin/switch", {
                staffId: f.get("staffId"),
                pin: f.get("pin"),
              });
              setPin(false);
              window.location.href = `/${slug}/start?branchId=${data.branch.id}`;
            } catch (err) {
              setPinError((err as Error).message);
            } finally {
              setPinBusy(false);
            }
          }}
        >
          <label className="field">
            พนักงาน
            <select
              name="staffId"
              defaultValue={data.staff.id}
              disabled={pinBusy}
              onChange={() => {
                setOperatorPin("");
                setPinError("");
              }}
            >
              {data.staffList
                .filter((s) => s.isActive && s.canSwitch)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName} · {s.role}
                  </option>
                ))}
            </select>
          </label>
          <PinPad
            value={operatorPin}
            onChange={(value) => {
              setOperatorPin(value);
              setPinError("");
            }}
            label="PIN ของพนักงาน"
            disabled={pinBusy}
          />
          {pinError && <p className="error">{pinError}</p>}
          <Button
            className="full"
            type="submit"
            disabled={pinBusy || operatorPin.length < 4}
          >
            {pinBusy ? "กำลังตรวจสอบ…" : "ยืนยัน PIN"}
          </Button>
        </form>
      </Modal>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </StoreContext.Provider>
  );
}
