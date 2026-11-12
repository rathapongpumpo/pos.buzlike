"use client";
import { useEffect, useRef, useState } from "react";
import { Clock, Volume2, ChefHat } from "lucide-react";
import { useStore } from "../store-context";
import { PageTitle } from "./shared";
import { Button } from "../ui/button";
export function Kitchen() {
  const { data, action, notify } = useStore();
  const [station, setStation] = useState("ALL"),
    [now, setNow] = useState(Date.now()),
    [sound, setSound] = useState(false);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const orders = data.orders.filter(
    (o) =>
      ["OPEN", "PAID"].includes(o.status) &&
      o.kitchenStatus !== "SERVED" &&
      (station === "ALL" || o.items.some((i) => i.kitchenStation === station)),
  );
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (
      sound &&
      known.current &&
      orders.some((o) => !known.current!.has(o.id))
    ) {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = 880;
      gain.gain.value = 0.12;
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
      oscillator.stop(audio.currentTime + 0.5);
      setTimeout(() => void audio.close(), 700);
    }
    known.current = ids;
  }, [orders, sound]);
  return (
    <>
      <PageTitle
        title="จอครัว"
        description={`${orders.length} ออเดอร์กำลังดำเนินการ`}
      >
        <Button variant="outline" onClick={() => setSound(!sound)}>
          <Volume2 size={18} />
          {sound ? "เสียงแจ้งเตือนเปิด" : "เปิดเสียงแจ้งเตือน"}
        </Button>
      </PageTitle>
      <div className="tabs">
        {[
          ["ALL", "ทั้งหมด"],
          ["BAR", "บาร์น้ำ"],
          ["MAIN", "ครัวร้อน"],
          ["BAKERY", "เบเกอรี่"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={station === key ? "active" : ""}
            onClick={() => setStation(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="kds-grid">
        {orders.map((o) => {
          const age = Math.max(
            0,
            Math.floor((now - +new Date(o.createdAt)) / 1000),
          );
          const next =
            o.kitchenStatus === "QUEUED"
              ? "PREPARING"
              : o.kitchenStatus === "PREPARING"
                ? "READY"
                : "SERVED";
          return (
            <article
              className={`panel ticket ${age >= 600 ? "late" : age >= 300 ? "warn" : ""}`}
              key={o.id}
            >
              <div className="row between">
                <span className="queue">
                  #{String(o.queueNumber).padStart(3, "0")}
                </span>
                <span className="row muted">
                  <Clock size={16} />
                  {Math.floor(age / 60)}:{String(age % 60).padStart(2, "0")}
                </span>
              </div>
              <div className="row between heading-row">
                <strong>
                  {o.table?.name ??
                    (o.orderType === "TAKEAWAY"
                      ? "กลับบ้าน"
                      : o.orderType === "DELIVERY"
                        ? "เดลิเวอรี่"
                        : "ทานที่ร้าน")}
                </strong>
                <small>
                  {new Date(o.createdAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
              {o.items
                .filter(
                  (i) => station === "ALL" || i.kitchenStation === station,
                )
                .map((i) => (
                  <button
                    key={i.id}
                    className={`ticket-item ${["READY", "SERVED"].includes(i.kitchenStatus) ? "done" : ""}`}
                    onClick={async () => {
                      try {
                        await action(`orders/${o.id}/kds`, {
                          status:
                            i.kitchenStatus === "READY" ? "PREPARING" : "READY",
                          itemId: i.id,
                        });
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <strong>{i.quantity}×</strong>
                    <div>
                      <strong>{i.productNameSnapshot}</strong>
                      {i.modifiers.map((m, j) => (
                        <p className="muted" style={{ fontSize: 12 }} key={j}>
                          {m.optionName}
                        </p>
                      ))}
                      {i.note && <p className="ticket-note">{i.note}</p>}
                    </div>
                  </button>
                ))}
              {o.customerNote && (
                <p className="ticket-note section-space">{o.customerNote}</p>
              )}
              <Button
                className="full ticket-footer"
                variant={next === "SERVED" ? "outline" : "default"}
                onClick={async () => {
                  try {
                    await action(`orders/${o.id}/kds`, { status: next });
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {next === "PREPARING"
                  ? "เริ่มทำ"
                  : next === "READY"
                    ? "พร้อมเสิร์ฟ"
                    : "เสิร์ฟครบแล้ว"}
              </Button>
            </article>
          );
        })}
      </div>
      {!orders.length && (
        <div className="empty">
          <ChefHat size={45} />
          <h2>ครัวพร้อมรับออเดอร์</h2>
          <p>ออเดอร์ใหม่จะแสดงที่นี่อัตโนมัติ</p>
        </div>
      )}
    </>
  );
}
