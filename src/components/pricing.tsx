"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "./ui/button";
import { money } from "@/lib/money";
import type { Bootstrap } from "@/lib/view-types";
import { planPrices } from "@/lib/plan-pricing";
import { publicPlanCards, pilotPricingNotice } from "@/lib/public-plan-cards";
export function Pricing({
  plans,
  onSelect,
  entryHref = "/register",
  entryLabel = "เริ่มทดลองฟรี",
  commerceAvailable = true,
}: {
  plans?: Bootstrap["plans"];
  onSelect?: (code: string) => void;
  entryHref?: string;
  entryLabel?: string;
  commerceAvailable?: boolean;
}) {
  const [yearly, setYearly] = useState(false);
  return (
    <>
      {!commerceAvailable && <p className="notice">{pilotPricingNotice}</p>}
      <div className="row between wrap heading-row">
        <p className="muted">เลือกแพ็กเกจที่เหมาะกับร้านของคุณ</p>
        <div className="tabs">
          <button
            className={!yearly ? "active" : ""}
            onClick={() => setYearly(false)}
          >
            รายเดือน
          </button>
          <button
            className={yearly ? "active" : ""}
            onClick={() => setYearly(true)}
          >
            รายปี · คุ้มกว่า
          </button>
        </div>
      </div>
      <div className={`plan-grid ${commerceAvailable ? "" : "pilot-pricing"}`}>
        {publicPlanCards(yearly)
          .filter((p) => commerceAvailable || p.code !== "LIFETIME_BUYOUT")
          .map((p, i) => (
            <div
              className={`panel plan ${i === 1 ? "featured" : ""}`}
              key={p.code}
            >
              <h3>{p.name}</h3>
              <small>{p.caption}</small>
              <div className="plan-price">
                ฿
                {money(
                  plans?.find((plan) => plan.code === p.code)?.price ?? p.price,
                ).replace(".00", "")}{" "}
                <small>
                  /{i === 2 ? "ครั้งเดียว" : yearly ? "ปี" : "เดือน"}
                </small>
              </div>
              {i < 2 &&
                yearly &&
                (() => {
                  const monthlyCode =
                    i === 0 ? "STARTER_MONTHLY" : "PRO_MONTHLY";
                  const monthly = Number(
                    plans?.find((plan) => plan.code === monthlyCode)?.price ??
                      planPrices[monthlyCode],
                  );
                  const annual = Number(
                    plans?.find((plan) => plan.code === p.code)?.price ??
                      p.price,
                  );
                  const saved = monthly * 12 - annual;
                  return (
                    <p className="plan-saving">
                      เฉลี่ย ฿{money(annual / 12)}/เดือน
                      {saved > 0 && (
                        <> · ประหยัด ฿{money(saved).replace(".00", "")}/ปี</>
                      )}
                    </p>
                  );
                })()}
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
              {!commerceAvailable ? (
                <Button
                  asChild
                  className="full"
                  variant={i === 1 ? "default" : "outline"}
                >
                  <Link href={entryHref}>
                    {entryLabel === "เริ่มทดลองฟรี"
                      ? "ลงทะเบียนรอ"
                      : entryLabel}
                  </Link>
                </Button>
              ) : onSelect ? (
                <Button
                  className="full"
                  variant={i === 1 ? "default" : "outline"}
                  onClick={() => onSelect(p.code)}
                >
                  เลือกแพ็กเกจ
                </Button>
              ) : (
                <Button
                  asChild
                  className="full"
                  variant={i === 1 ? "default" : "outline"}
                >
                  <Link href={`/subscribe?plan=${p.code}`}>เลือก {p.name}</Link>
                </Button>
              )}
            </div>
          ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 15 }}>
        ราคาแพ็กเกจยังไม่รวม VAT 7%
        {commerceAvailable &&
          " · Lifetime มีค่าดูแล Cloud ตั้งแต่ปีที่ 2 หากเลือกใช้ Cloud ต่อ"}
      </p>
      <section className="feature-comparison" aria-labelledby="compare-title">
        <h3 id="compare-title">Starter กับ Pro ต่างกันอย่างไร?</h3>
        <p className="muted">
          Starter ดูแลงานขายที่เคาน์เตอร์ ส่วน Pro
          เพิ่มระบบทำงานร่วมกันระหว่างโต๊ะ ครัว และคลังวัตถุดิบ
        </p>
        <div className="comparison-scroll">
          <table>
            <caption className="sr-only">
              {commerceAvailable
                ? "เปรียบเทียบฟีเจอร์ Starter, Pro และ Lifetime"
                : "เปรียบเทียบฟีเจอร์ Starter และ Pro"}
            </caption>
            <thead>
              <tr>
                <th scope="col">การใช้งาน</th>
                <th scope="col">Starter</th>
                <th scope="col">Pro</th>
                {commerceAvailable && <th scope="col">Lifetime</th>}
              </tr>
            </thead>
            <tbody>
              {[
                ["ขายหน้าร้าน รับเงิน และพิมพ์ใบเสร็จ", true, true, true],
                ["เปิด–ปิดกะ / PIN พนักงาน / ส่งออกรายงาน", true, true, true],
                ["ตัดสต็อกสินค้าสำเร็จรูปเป็นชิ้น", true, true, true],
                ["จอครัวสด แยกสถานีและติดตามเวลารอ", false, true, true],
                ["ผังโต๊ะ / ย้ายโต๊ะ / รวมโต๊ะ", false, true, true],
                ["QR สั่งอาหารที่โต๊ะ / เรียกพนักงาน", false, true, true],
                ["สูตรอาหาร BOM ตัดวัตถุดิบเป็นกรัม/มล.", false, true, true],
                ["จำนวนสาขา", "1 สาขา", "3 สาขา", "1 สาขา"],
                [
                  "เครื่องขาย / สินค้า / พนักงาน",
                  "1 / 300 / 5",
                  "ไม่จำกัด",
                  "ไม่จำกัด",
                ],
                ["ส่งออกข้อมูลเพื่อติดตั้งระบบเอง", false, false, true],
              ].map(([label, ...values]) => (
                <tr key={String(label)}>
                  <th scope="row">{label}</th>
                  {values
                    .filter((_, i) => commerceAvailable || i < 2)
                    .map((v, i) => (
                      <td key={i}>
                        {typeof v === "boolean" ? (
                          v ? (
                            <span className="comparison-yes">
                              <Check size={18} />
                              มี
                            </span>
                          ) : (
                            <span className="comparison-no">
                              <Minus size={16} />
                              ไม่รวม
                            </span>
                          )
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
