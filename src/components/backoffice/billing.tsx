"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, RefreshCw } from "lucide-react";
import { useStore } from "../store-context";
import { Pricing } from "../pricing";
import { PlanIntent } from "../plan-intent";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PageTitle, FormModal, fString, Status } from "./shared";
import { api } from "@/lib/client-api";
import { money } from "@/lib/money";
import type { Bootstrap } from "@/lib/view-types";
type Payment = Bootstrap["payments"][number];
type CheckoutResult = { url?: string; payment?: Payment; payload?: string };
type Quote = { amount: number; vat: number; total: number };
type Receipt = {
  planName?: string;
  customerName?: string;
  taxId?: string;
  billingAddress?: string;
};
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export function Billing() {
  const { data, slug, refresh, notify } = useStore();
  const [code, setCode] = useState(""),
    [method, setMethod] = useState("STRIPE_CARD"),
    [tax, setTax] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null),
    [coupon, setCoupon] = useState(""),
    [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [invoice, setInvoice] = useState<{
      payment: Payment;
      payload?: string;
    } | null>(null),
    [upload, setUpload] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"cancel" | "resume" | null>(
    null,
  );
  const requestKey = useRef("");
  const tenant = data.tenant;
  const recurring = !!data.integrations.recurring;
  const commerceAvailable = data.release?.checkoutAvailable ?? true;
  const pilot = data.entitlement?.source === "PILOT";
  async function check(paymentId?: string) {
    await api("/api/billing/status", { storeSlug: slug, paymentId });
    await refresh();
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showCheckout(result: CheckoutResult) {
    if (result.url) window.location.assign(result.url);
    else if (result.payment) {
      setInvoice({ payment: result.payment, payload: result.payload });
      await refresh();
    }
  }
  function selectPlan(value: string) {
    if (!commerceAvailable) return;
    const p = data.plans.find((p) => p.code === value);
    if (!p) return;
    requestKey.current = crypto.randomUUID();
    setAppliedCoupon("");
    setCoupon("");
    setTax(false);
    setCouponError("");
    setMethod(
      data.integrations.stripe
        ? "STRIPE_CARD"
        : data.integrations.platformPromptpay
          ? "BANK_SLIP"
          : "STRIPE_CARD",
    );
    setQuote({
      amount: Number(p.price),
      vat: Math.round(Number(p.price) * 7) / 100,
      total: Math.round(Number(p.price) * 107) / 100,
    });
    setCode(value);
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("plan");
    if (selected) selectPlan(selected);
    const id = params.get("checkout");
    if (!id) return;
    setMessage(
      params.has("canceled")
        ? "คุณกลับจากหน้าชำระเงิน รายการยังรอชำระ สามารถดำเนินการต่อหรือยกเลิกรายการด้านล่าง"
        : "กำลังตรวจสอบการรับเงิน สิทธิ์จะเปิดหลังระบบยืนยันยอดแล้ว",
    );
    let stopped = false,
      attempts = 0;
    async function poll() {
      if (stopped) return;
      try {
        const result = await api<{ payments: Payment[] }>(
          "/api/billing/status",
          { storeSlug: slug, paymentId: id },
        );
        if (stopped) return;
        await refresh();
        const p = result.payments.find((p) => p.id === id);
        if (p && p.status !== "PENDING") {
          setMessage(
            ["PAID", "PARTIALLY_REFUNDED"].includes(p.status)
              ? "รับชำระแล้ว เปิดสิทธิ์ให้บัญชีนี้เรียบร้อย คุณเริ่มใช้งานร้านได้ทันที"
              : "รายการสิ้นสุดแล้ว กรุณาตรวจสอบสถานะในประวัติ",
          );
          return;
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped && ++attempts < 6) timer = setTimeout(poll, 10000);
      else if (!stopped)
        setMessage(
          "ยังรอยืนยันการรับเงิน กรุณากดตรวจสอบสถานะ หลีกเลี่ยงการสร้างรายการใหม่หากชำระไปแล้ว",
        );
    }
    let timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Run once per business; bootstrap refreshes must not reopen checkout or restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const receipt = invoice?.payment.receipt as Receipt | null;
  return (
    <>
      <PlanIntent plan={commerceAvailable ? code || null : null} />
      <PageTitle
        title={pilot ? "สิทธิ์นำร่องของร้าน" : "แพ็กเกจและการชำระเงิน"}
        description={
          pilot
            ? "ดูวันหมดสิทธิ์และแพ็กเกจเมื่อเปิดบริการ"
            : "ดูสิทธิ์ร้าน จัดการการต่ออายุ และดาวน์โหลดใบเสร็จ"
        }
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="panel billing-membership">
        <div>
          <span className="muted">แพ็กเกจปัจจุบัน</span>
          <h2>
            {pilot
              ? "Pro นำร่อง · ไม่มีค่าใช้จ่าย"
              : data.plans.find((p) => p.code === tenant.planCode)?.name}
          </h2>
          <Status status={data.state} />
        </div>
        <div>
          <span className="muted">
            {data.state === "TRIALING"
              ? "ทดลองใช้ถึง"
              : tenant.isLifetime
                ? "ระยะเวลาสิทธิ์"
                : "สิทธิ์ใช้งานถึง"}
          </span>
          <p>
            <strong>
              {tenant.isLifetime
                ? "ซื้อขาด"
                : date(
                    data.state === "TRIALING"
                      ? tenant.trialEndsAt
                      : tenant.currentPeriodEndsAt,
                  )}
            </strong>
          </p>
          <small>
            {recurring
              ? tenant.cancelAtPeriodEnd
                ? "ยกเลิกการต่ออายุแล้ว ใช้งานได้ถึงวันสิ้นสุดรอบ"
                : "ต่ออายุและตัดบัตรอัตโนมัติทุกงวด"
              : "ไม่มีการตัดบัตรอัตโนมัติ"}
          </small>
        </div>
        <div className="billing-actions">
          {recurring && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await api<{ url: string }>(
                      "/api/billing/manage",
                      { storeSlug: slug, action: "payment-method" },
                    );
                    window.location.assign(r.url);
                  })
                }
              >
                เปลี่ยนบัตรชำระเงิน
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setConfirmation(
                    tenant.cancelAtPeriodEnd ? "resume" : "cancel",
                  )
                }
              >
                {tenant.cancelAtPeriodEnd
                  ? "เปิดต่ออายุอีกครั้ง"
                  : "ยกเลิกการต่ออายุ"}
              </Button>
            </>
          )}
          {data.integrations.hasStripeSubscription && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void act(() => check())}
            >
              <RefreshCw size={16} /> ตรวจสอบสถานะ
            </Button>
          )}
        </div>
      </section>
      {!commerceAvailable && (
        <div className="notice billing-pilot-notice">
          <p>
            {pilot
              ? "สิทธิ์นำร่องไม่มีค่าใช้จ่าย และไม่มีการตัดเงินอัตโนมัติ"
              : "ยังไม่เปิดรับชำระสมาชิกใหม่ ดูสิทธิ์และรายการเดิมได้ตามปกติ"}
          </p>
          <a href="mailto:support@buzlike.com">ติดต่อทีม BUZLIKE</a>
        </div>
      )}
      {commerceAvailable && !data.integrations.stripe && (
        <p className="notice">
          การชำระและเปิดสิทธิ์อัตโนมัติยังไม่เปิดให้บริการ
          คุณยังตั้งร้านและทดลองใช้งานได้
          ระบบจะแสดงช่องทางชำระเมื่อพร้อมให้บริการ
        </p>
      )}
      {recurring && (
        <p className="notice">
          มีสมาชิกต่ออายุผ่านบัตรอยู่แล้ว หากต้องการเปลี่ยนแพ็กเกจ
          ให้ยกเลิกการต่ออายุและรอสิ้นสุดรอบเดิมก่อน
          เพื่อรักษาระยะเวลาที่ชำระไว้
        </p>
      )}
      {!tenant.isLifetime && (
        <div className="billing-pricing">
          <Pricing
            plans={data.plans}
            onSelect={selectPlan}
            commerceAvailable={commerceAvailable}
            entryHref="/pilot"
            entryLabel="ดูโครงการนำร่อง"
          />
        </div>
      )}
      <h2 className="section-space">ประวัติการชำระเงิน</h2>
      <div className="billing-history">
        {!data.payments.length && (
          <div className="panel empty">ยังไม่มีรายการชำระเงินค่าสมาชิก</div>
        )}
        {data.payments.map((p) => (
          <article className="panel billing-payment" key={p.id}>
            <div>
              <strong className="billing-number">{p.invoiceNumber}</strong>
              <small>
                {date(p.createdAt)} ·{" "}
                {(p.receipt as Receipt | null)?.planName ??
                  data.plans.find((plan) => plan.code === p.planCode)?.name}
              </small>
              <Status
                status={
                  p.status === "PENDING" && !p.slipImageUrl
                    ? "AWAITING_PAYMENT"
                    : p.status
                }
              />
            </div>
            <div className="billing-total">
              <strong>฿{money(p.totalAmount)}</strong>
              <small>รวม VAT 7%</small>
              {Number(p.refundedAmount) > 0 && (
                <small>คืนแล้ว ฿{money(p.refundedAmount)}</small>
              )}
            </div>
            <div className="billing-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInvoice({ payment: p })}
              >
                ดูเอกสาร
              </Button>
              {p.status === "PENDING" && (
                <>
                  {p.paymentMethod === "BANK_SLIP" ? (
                    <Button
                      size="sm"
                      disabled={!commerceAvailable}
                      onClick={() => setUpload(p)}
                    >
                      {p.slipImageUrl ? "ส่งสลิปใหม่" : "แนบสลิป · รอตรวจ"}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={busy || !commerceAvailable}
                        onClick={() =>
                          void act(async () =>
                            showCheckout(
                              await api<CheckoutResult>("/api/billing/resume", {
                                storeSlug: slug,
                                paymentId: p.id,
                              }),
                            ),
                          )
                        }
                      >
                        ชำระรายการเดิม
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void act(() => check(p.id))}
                      >
                        ตรวจสอบสถานะ
                      </Button>
                    </>
                  )}
                  {!p.slipImageUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api("/api/billing/manage", {
                            storeSlug: slug,
                            paymentId: p.id,
                            action: "abandon",
                          });
                          await refresh();
                        })
                      }
                    >
                      ยกเลิกรายการ
                    </Button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {tenant.isLifetime && (
        <div className="notice section-space">
          <Button asChild variant="outline">
            <a href={`/api/billing/export?storeSlug=${slug}`}>
              ดาวน์โหลดข้อมูลร้าน JSON
            </a>
          </Button>
        </div>
      )}
      {code && (
        <FormModal
          title={`สมัคร ${data.plans.find((p) => p.code === code)?.name}`}
          onClose={() => setCode("")}
          submit="ยืนยันยอดและไปชำระ"
          submitDisabled={
            !quote ||
            (method === "BANK_SLIP"
              ? !data.integrations.platformPromptpay
              : !data.integrations.stripe) ||
            recurring
          }
          onSubmit={async (f) => {
            if (coupon.trim().toUpperCase() !== appliedCoupon)
              throw new Error(
                "กรุณากดใช้คูปองก่อนยืนยันยอด หรือเว้นช่องคูปองว่าง",
              );
            try {
              await showCheckout(
                await api<CheckoutResult>("/api/billing/checkout", {
                  requestKey: requestKey.current,
                  storeSlug: slug,
                  planCode: code,
                  method,
                  confirmedTotal: Math.round(quote!.total * 100),
                  coupon: appliedCoupon,
                  companyName: tax ? fString(f, "company") : "",
                  taxId: tax ? fString(f, "taxId") : "",
                  billingAddress: tax ? fString(f, "address") : "",
                }),
              );
            } finally {
              await refresh();
            }
          }}
        >
          {!data.integrations.stripe &&
            !data.integrations.platformPromptpay && (
              <p className="notice" role="status">
                ขณะนี้ยังไม่เปิดรับชำระ คุณดูราคาและตั้งร้านทดลองใช้งานต่อได้
              </p>
            )}
          <label className="field">
            ช่องทางชำระ
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="STRIPE_CARD" disabled={!data.integrations.stripe}>
                บัตรเครดิต / เดบิต
                {!data.integrations.stripe ? " · ยังไม่เปิดให้บริการ" : ""}
              </option>
              <option
                value="STRIPE_PROMPTPAY"
                disabled={!data.integrations.stripe}
              >
                PromptPay · จ่ายเองแต่ละงวด
                {!data.integrations.stripe ? " · ยังไม่เปิดให้บริการ" : ""}
              </option>
              <option
                value="BANK_SLIP"
                disabled={!data.integrations.platformPromptpay}
              >
                โอนและแนบสลิป · ต้องรอผู้ดูแลอนุมัติ
                {!data.integrations.platformPromptpay
                  ? " · ยังไม่เปิดให้บริการ"
                  : ""}
              </option>
            </select>
          </label>
          <p className="muted">
            {method === "STRIPE_CARD" && code !== "LIFETIME_BUYOUT"
              ? `ตัดบัตรอัตโนมัติทุก${code.includes("YEARLY") ? "ปี" : "เดือน"} ตามยอดรวมด้านล่าง ยกเลิกการต่ออายุได้ก่อนรอบถัดไป`
              : method === "BANK_SLIP"
                ? "ช่องทางนี้เปิดสิทธิ์หลังผู้ดูแลตรวจสลิป ไม่ใช่การชำระอัตโนมัติ"
                : "จ่ายครั้งเดียว ไม่มีการตัดเงินอัตโนมัติ"}
          </p>
          <div className="billing-coupon">
            <label className="field">
              คูปองส่วนลด
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                maxLength={40}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setCouponError("");
                try {
                  const result = await api<Quote>("/api/billing/quote", {
                    storeSlug: slug,
                    planCode: code,
                    coupon,
                  });
                  setQuote(result);
                  setAppliedCoupon(coupon.trim().toUpperCase());
                } catch (e) {
                  setCouponError((e as Error).message);
                }
              }}
            >
              ใช้คูปอง
            </Button>
          </div>
          {couponError && (
            <p className="error" role="alert">
              {couponError}
            </p>
          )}
          {appliedCoupon && (
            <small>
              {method === "STRIPE_CARD" && code !== "LIFETIME_BUYOUT"
                ? "ส่วนลดนี้ใช้กับทุกงวดของสมาชิกที่สมัครครั้งนี้"
                : "ส่วนลดนี้ใช้กับรายการชำระครั้งนี้"}
            </small>
          )}
          {quote && (
            <dl className="billing-summary">
              <div>
                <dt>ราคาแพ็กเกจ</dt>
                <dd>฿{money(quote.amount)}</dd>
              </div>
              <div>
                <dt>VAT 7%</dt>
                <dd>฿{money(quote.vat)}</dd>
              </div>
              <div>
                <dt>ยอดชำระรวม</dt>
                <dd>฿{money(quote.total)}</dd>
              </div>
            </dl>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={tax}
              onChange={(e) => setTax(e.target.checked)}
            />
            ข้อมูลสำหรับเอกสารในนามบริษัท
          </label>
          {tax && (
            <>
              <label className="field">
                ชื่อบริษัท
                <input
                  name="company"
                  required
                  maxLength={200}
                  defaultValue={tenant.companyName ?? ""}
                />
              </label>
              <label className="field">
                เลขประจำตัวผู้เสียภาษี
                <input
                  name="taxId"
                  inputMode="numeric"
                  pattern="[0-9]{13}"
                  maxLength={13}
                  required
                  defaultValue={tenant.taxId ?? ""}
                />
              </label>
              <label className="field">
                ที่อยู่สำหรับออกเอกสาร
                <textarea
                  name="address"
                  required
                  maxLength={600}
                  defaultValue={tenant.billingAddress ?? ""}
                />
              </label>
            </>
          )}
        </FormModal>
      )}
      {confirmation && (
        <FormModal
          title={
            confirmation === "cancel"
              ? "ยกเลิกการต่ออายุอัตโนมัติ"
              : "เปิดการต่ออายุอัตโนมัติอีกครั้ง"
          }
          onClose={() => setConfirmation(null)}
          submit="ยืนยัน"
          onSubmit={async () => {
            await api("/api/billing/manage", {
              storeSlug: slug,
              action: confirmation,
            });
            await refresh();
            notify("อัปเดตการต่ออายุแล้ว");
          }}
        >
          <p>
            {confirmation === "cancel"
              ? `จะไม่ตัดบัตรในรอบถัดไป คุณยังใช้สิทธิ์ที่ชำระไว้ได้ถึง ${date(tenant.currentPeriodEndsAt)} ข้อมูลร้านยังเก็บไว้ การยกเลิกไม่ใช่การขอคืนเงิน`
              : "ระบบจะตัดบัตรอัตโนมัติเมื่อเริ่มรอบถัดไป ตามยอดแพ็กเกจเดิม"}
          </p>
        </FormModal>
      )}
      <Modal
        title="เอกสารค่าสมาชิก"
        open={!!invoice}
        onClose={() => setInvoice(null)}
      >
        {invoice && (
          <>
            <div className="receipt billing-receipt">
              <h2>BUZLIKE POS</h2>
              <p>
                {["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
                  invoice.payment.status,
                )
                  ? "ใบเสร็จรับเงิน"
                  : "ใบแจ้งชำระเงิน"}
              </p>
              <strong>{invoice.payment.invoiceNumber}</strong>
              <p>{date(invoice.payment.createdAt)}</p>
              <Status status={invoice.payment.status} />
              <p>
                {receipt?.customerName ??
                  "ข้อมูลผู้ซื้อเดิมไม่ได้บันทึกเป็น snapshot"}
              </p>
              {receipt?.taxId && <p>เลขผู้เสียภาษี {receipt.taxId}</p>}
              {receipt?.billingAddress && <p>{receipt.billingAddress}</p>}
              <hr />
              <p>{receipt?.planName ?? invoice.payment.planCode}</p>
              {invoice.payment.periodStart && (
                <p>
                  รอบสิทธิ์ {date(invoice.payment.periodStart)} ถึง{" "}
                  {invoice.payment.periodEnd
                    ? date(invoice.payment.periodEnd)
                    : "ซื้อขาด"}
                </p>
              )}
              <div className="receipt-line">
                <span>ก่อน VAT</span>
                <span>{money(invoice.payment.amount)}</span>
              </div>
              <div className="receipt-line">
                <span>VAT 7%</span>
                <span>{money(invoice.payment.vatAmount)}</span>
              </div>
              <div className="receipt-line">
                <strong>รวมทั้งสิ้น</strong>
                <strong>{money(invoice.payment.totalAmount)}</strong>
              </div>
              {Number(invoice.payment.refundedAmount) > 0 && (
                <div className="receipt-line">
                  <span>คืนเงินแล้ว</span>
                  <span>{money(invoice.payment.refundedAmount)}</span>
                </div>
              )}
              {invoice.payload && invoice.payment.status === "PENDING" && (
                <div className="center">
                  <QRCodeSVG value={invoice.payload} size={180} />
                  <p>โอนตามยอดแล้วแนบสลิปเพื่อรอตรวจสอบ</p>
                </div>
              )}
              <hr />
              <p>เอกสารรับชำระจากระบบสมาชิก ไม่ใช่ใบกำกับภาษีอิเล็กทรอนิกส์</p>
            </div>
            <div className="modal-footer no-print">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer size={17} />
                พิมพ์ / บันทึก PDF
              </Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        title="แนบหลักฐานการโอน"
        open={!!upload}
        onClose={() => setUpload(null)}
      >
        {upload && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              form.set("storeSlug", slug);
              form.set("paymentId", upload.id);
              await act(async () => {
                const res = await fetch("/api/billing/slip", {
                  method: "POST",
                  body: form,
                });
                const b = await res.json();
                if (!res.ok) throw new Error(b.error);
                await refresh();
                setUpload(null);
                notify("ส่งหลักฐานแล้ว รอผู้ดูแลอนุมัติ");
              });
            }}
          >
            <p>ยอด ฿{money(upload.totalAmount)}</p>
            <label className="field">
              รูปสลิป PNG / JPEG ไม่เกิน 5 MB
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg"
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "กำลังส่ง…" : "ส่งหลักฐาน"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
