import Link from "next/link";
import { ArrowRight, Check, ShoppingCart, ChefHat, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pricing } from "@/components/pricing";
import { db } from "@/lib/db";
import { accountNavigation } from "@/lib/account-navigation";
import { MarketingHeader } from "@/components/marketing-header";
import { planPrices } from "@/lib/plan-pricing";
import { releasePolicy } from "@/lib/release-policy";
import {
  publicMetadata,
  publicStructuredData,
  supportEmail,
} from "@/lib/public-site";
export const metadata = publicMetadata(
  "/",
  "ระบบขายหน้าร้านสำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก",
  "รู้จักฟีเจอร์ BUZLIKE POS ตั้งแต่ขายหน้าร้าน สต็อก และพนักงาน ไปจนถึง QR สั่งอาหาร จอครัว และสูตรวัตถุดิบใน Pro",
);
export const dynamic = "force-dynamic";
export default async function Page() {
  const [account, availablePlans, policy] = await Promise.all([
    accountNavigation(),
    db.plan.findMany(),
    releasePolicy(),
  ]);
  const plans = JSON.parse(JSON.stringify(availablePlans));
  const privatePilot = policy.releaseMode === "PRIVATE_PILOT";
  const commerceAvailable = !privatePilot && policy.checkoutMode === "PUBLIC";
  const guestHref = privatePilot ? "/pilot/waitlist" : "/register";
  const guestLabel = privatePilot
    ? "ลงทะเบียนรอเปิดบริการ"
    : "ทดลองใช้งานฟรี 14 วัน";
  const entryHref = account?.href ?? guestHref;
  return (
    <main className="marketing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(publicStructuredData()).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <MarketingHeader
        entryHref={guestHref}
        entryLabel={privatePilot ? "ลงทะเบียนรอ" : "ทดลองใช้งานฟรี"}
        account={
          account
            ? {
                userId: account.userId,
                href: account.href,
                label: account.label,
              }
            : null
        }
      />
      <section className="marketing-hero">
        <div>
          <h1>
            ระบบขายหน้าร้าน
            <br />
            ที่ดูแลได้<span className="hero-accent">ถึงหลังร้าน</span>
          </h1>
          <p>
            สำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก ตั้งแต่เลือกเมนู รับเงิน
            และพิมพ์ใบเสร็จ ไปจนถึง QR สั่งอาหาร จอครัว และตัดวัตถุดิบตามสูตร
          </p>
          <Button asChild>
            <Link href={entryHref}>
              {account?.label ?? guestLabel} <ArrowRight size={18} />
            </Link>
          </Button>
          <a className="hero-feature-link" href="#features">
            ดูว่าระบบทำอะไรได้บ้าง <ArrowRight size={16} />
          </a>
          <small style={{ display: "block", marginTop: 14 }}>
            {privatePilot ? (
              <>
                นำร่อง Pro ฟรี 30 วันสำหรับ 5 ธุรกิจตามคำเชิญ ·{" "}
                <Link href="/pilot">ดูรายละเอียดโครงการ</Link>
              </>
            ) : (
              <>
                ไม่ต้องใช้บัตรเครดิต · ตั้งสินค้าและราคาได้เอง · Starter เริ่ม{" "}
                {Number(
                  availablePlans.find((plan) => plan.code === "STARTER_MONTHLY")
                    ?.price ?? planPrices.STARTER_MONTHLY,
                )}{" "}
                บาท/เดือน
              </>
            )}
          </small>
        </div>
        <div className="hero-product">
          <img
            src="/feature-pos.png"
            alt="หน้าจอขายจริง: เมนูสินค้า ตะกร้า ส่วนลด VAT และรับชำระเงิน"
            width={1536}
            height={1024}
          />
          <span className="screenshot-caption">
            หน้าจอจริงจากร้านทดสอบ · เลือกเมนู คิดเงิน และพิมพ์ใบเสร็จ
          </span>
        </div>
      </section>
      <section className="marketing-section">
        <h2>ตั้งแต่หน้าร้าน จนถึงหลังบ้าน</h2>
        <div className="workflow">
          {[
            [
              "01",
              "รับออเดอร์",
              "Starter ขายที่เคาน์เตอร์ · Pro เพิ่ม QR สั่งอาหารที่โต๊ะ",
            ],
            ["02", "คิดเงิน", "เงินสด พร้อมเพย์ บัตร และใบเสร็จภาษาไทย"],
            [
              "03",
              "ส่งเข้าครัว",
              "Pro ส่งออเดอร์ขึ้นจอครัว แยกสถานีและติดตามเวลารอ",
            ],
            [
              "04",
              "ดูแลร้าน",
              "Starter ดูยอดขายและสต็อกรายชิ้น · Pro เพิ่มสูตรวัตถุดิบ",
            ],
          ].map(([n, title, desc]) => (
            <div key={n}>
              <b>{n}</b>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="marketing-section product-features" id="features">
        <h2>ระบบช่วยร้านคุณได้อย่างไร?</h2>
        <p className="feature-intro">
          เริ่มจากงานขายที่เคาน์เตอร์ แล้วเลือก Pro เมื่อร้านต้องเชื่อมงานโต๊ะ
          ครัว และวัตถุดิบเข้าด้วยกัน
        </p>
        {[
          {
            title: "ขายคล่องที่เคาน์เตอร์ ตั้งแต่เลือกเมนูจนปิดกะ",
            plan: "Starter และ Pro",
            Icon: ShoppingCart,
            image: "/feature-pos.png",
            alt: "หน้าจอ POS พร้อมสินค้า ตะกร้า และสรุปยอดชำระ",
            description:
              "เหมาะกับร้านกาแฟแบบรับกลับบ้าน ร้านเบเกอรี่ และร้านค้าปลีกที่ต้องการจัดการยอดขายในที่เดียว",
            features: [
              "ค้นหาสินค้าหรือสแกนบาร์โค้ด เลือกความหวานและท็อปปิ้ง",
              "พักบิล ใส่ส่วนลด แบ่งจ่าย และออกใบเสร็จภาษาไทย 58/80 มม.",
              "รับเงินสด สร้าง QR พร้อมเพย์ และบันทึกการรับเงินจากเครื่องบัตร",
              "เปิด–ปิดกะ ตรวจเงินสดขาด–เกิน และสลับพนักงานด้วย PIN",
              "ดูยอดขาย สินค้าขายดี และดาวน์โหลดรายงาน CSV",
            ],
            note: "พร้อมเพย์หน้าร้านให้แคชเชียร์ตรวจยอดเงินจริงก่อนยืนยันรับเงิน",
          },
          {
            title: "ให้โต๊ะกับครัวรับออเดอร์เดียวกัน",
            plan: "เพิ่มใน Pro และ Lifetime",
            Icon: ChefHat,
            image: "/feature-kitchen.png",
            alt: "จอครัวจริง แสดงคิวอาหาร สถานี และปุ่มเปลี่ยนสถานะ",
            description:
              "สำหรับร้านที่มีลูกค้านั่งทานและมีทีมเตรียมอาหาร ลดการส่งต่อรายการหลายรอบด้วยออเดอร์เดียวกันทั้งร้าน",
            features: [
              "เปิดโต๊ะและพิมพ์ QR ให้ลูกค้าสั่งอาหารผ่านมือถือ ไม่ต้องโหลดแอป",
              "ลูกค้าเลือกตัวเลือกเมนู เรียกพนักงาน หรือขอเช็กบิลได้",
              "ออเดอร์ขึ้นจอครัวสด แยกบาร์น้ำ ครัวร้อน และเบเกอรี่",
              "ครัวกดเริ่มทำ → พร้อมเสิร์ฟ → เสิร์ฟครบ พร้อมตัวจับเวลารอ",
              "ย้ายโต๊ะ รวมโต๊ะ และรับชำระบิลโต๊ะ โดย QR เดิมหมดอายุเมื่อปิดโต๊ะ",
            ],
            note: "Starter ขายหน้าร้านได้ตามปกติ แต่ไม่รวมผังโต๊ะ QR สั่งอาหาร และจอครัว",
          },
          {
            title: "รู้ว่าวัตถุดิบหายไปกับเมนูไหน",
            plan: "เพิ่มใน Pro และ Lifetime",
            Icon: Scale,
            image: "/feature-inventory.png",
            alt: "คลังวัตถุดิบและประวัติรับเข้า ตัดขาย คืนสต็อก",
            description:
              "Starter นับสินค้าสำเร็จรูปเป็นชิ้น ส่วน Pro ผูกสูตรของแต่ละเมนู แล้วตัดวัตถุดิบเมื่อบิลชำระเงินสำเร็จ",
            features: [
              "ตั้งสูตรลาเต้ 1 แก้ว ใช้กาแฟ 18 กรัม นม 150 มล. และแก้ว 1 ใบ",
              "ตัดยอดวัตถุดิบตามจำนวนที่ขาย พร้อมประวัติความเคลื่อนไหว",
              "รับของเข้า บันทึกของเสีย และปรับยอดพร้อมระบุเหตุผล",
              "ยกเลิกหรือคืนเงินแล้วคืนสต็อก พร้อมบันทึกผู้ทำรายการ",
              "แจ้งวัตถุดิบถึงจุดสั่งซื้อ และดูแลสต็อกแยกสาขาได้สูงสุด 3 สาขาใน Pro",
            ],
            note: "ระบบสูตรวัตถุดิบเป็นฟีเจอร์เพิ่มของ Pro ไม่ใช่เพียงเพิ่มจำนวนสินค้า",
          },
        ].map(
          (
            { title, plan, Icon, image, alt, description, features, note },
            i,
          ) => (
            <article
              className={`feature-band ${i % 2 ? "reverse" : ""}`}
              key={title}
            >
              <div className="feature-copy">
                <span className="feature-plan">
                  <Icon size={18} />
                  {plan}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>
                  {features.map((text) => (
                    <li key={text}>
                      <Check size={17} />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <small>{note}</small>
              </div>
              <figure className="feature-screen">
                <img
                  src={image}
                  alt={alt}
                  width={1536}
                  height={1024}
                  loading="lazy"
                />
                <figcaption>ภาพจากระบบจริง · ข้อมูลร้านทดสอบ</figcaption>
              </figure>
            </article>
          ),
        )}
      </section>
      <section className="marketing-section" id="pricing">
        <h2>เลือกตามวิธีทำงานของร้าน</h2>
        <Pricing
          plans={plans}
          entryHref={entryHref}
          entryLabel={account?.label}
          commerceAvailable={commerceAvailable}
        />
      </section>
      <section className="marketing-section getting-started">
        <div>
          <h2>
            {privatePilot
              ? "เริ่มต้นจากโครงการนำร่อง"
              : "เริ่มทดลองกับร้านของคุณได้เลย"}
          </h2>
          <p>
            {privatePilot
              ? "รับคำเชิญ → ยืนยันอีเมล → ตั้งร้านและ PIN → เพิ่มสินค้าและราคา"
              : "สมัครบัญชี → ตั้งชื่อและประเภทร้าน → ตั้ง PIN → เพิ่มสินค้าและราคา"}
            ร้านเริ่มจากข้อมูลเปล่า พร้อมเพย์และภาษีตั้งภายหลังได้
          </p>
          <p className="muted">
            {privatePilot
              ? "Pro ฟรี 30 วันสำหรับ 5 ธุรกิจตามคำเชิญ เริ่มนับเมื่อเปิดร้านสำเร็จ ผู้ไม่มีคำเชิญลงทะเบียนรอได้ ยังไม่เปิดรับชำระเงิน"
              : "ทดลองจอครัว QR โต๊ะ และสูตรวัตถุดิบได้ 14 วัน จำกัดสินค้า 50 รายการ พนักงาน 3 คน และยังไม่รวมการส่งออกรายงาน"}
          </p>
        </div>
        <Button asChild>
          <Link href={entryHref}>
            {account?.label ??
              (privatePilot ? "ลงทะเบียนรอ" : "สร้างร้านทดลองฟรี")}{" "}
            <ArrowRight size={17} />
          </Link>
        </Button>
      </section>
      <footer className="marketing-footer">
        <Link href="https://buzlike.com/">BUZLIKE SYSTEMS</Link>
        <span>ระบบขายหน้าร้านสำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก</span>
        <Link href="/about">เกี่ยวกับเรา</Link>
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        <Link href="/privacy">ความเป็นส่วนตัว</Link>
        <Link href="/terms">ข้อกำหนดนำร่อง</Link>
        <Link href="/support">ช่วยเหลือ</Link>
        <Link href={account?.href ?? "/login"}>
          {account?.label ?? "เข้าสู่ระบบร้านค้า"}
        </Link>
      </footer>
    </main>
  );
}
