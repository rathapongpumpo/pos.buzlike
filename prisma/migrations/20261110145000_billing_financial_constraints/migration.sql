-- No row is deleted or rewritten. Refunded totals may never exceed the original receipt.
ALTER TABLE "SaasPayment" ADD CONSTRAINT "SaasPayment_refund_bounds"
CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "totalAmount");
ALTER TABLE "SaasPayment" ADD CONSTRAINT "SaasPayment_nonnegative_amounts"
CHECK ("amount" >= 0 AND "vatAmount" >= 0 AND "totalAmount" >= 0);
CREATE INDEX "SaasPayment_status_providerCheckedAt_idx" ON "SaasPayment"("status", "providerCheckedAt");
