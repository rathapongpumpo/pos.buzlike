export const money = (value: unknown) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
export const cents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100);
export function totals(
  subtotal: number,
  discount: number,
  vatRate: number,
  inclusive: boolean,
  serviceRate: number,
) {
  const sub = cents(subtotal),
    off = Math.min(sub, Math.max(0, cents(discount))),
    service = Math.round(((sub - off) * serviceRate) / 100),
    base = sub - off + service;
  const vat = inclusive
    ? Math.round((base * vatRate) / (100 + vatRate))
    : Math.round((base * vatRate) / 100);
  return {
    subtotal: sub / 100,
    discountAmount: off / 100,
    serviceChargeAmount: service / 100,
    vatAmount: vat / 100,
    grandTotal: (inclusive ? base : base + vat) / 100,
  };
}
