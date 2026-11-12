# Pricing and product explanation — 5 November 2026

> Historical change record. Current regular prices for all customers are Starter 199/month or 1,990/year and Pro 499/month or 4,990/year. See [11 November 2026 update](./regular-pricing-2026-11-11.md).

Owner-approved prices (excluding VAT): Starter ฿390/month or ฿3,500/year; Pro ฿790/month or ฿7,500/year. Lifetime remains ฿12,900. Applied as a data migration to the Plan catalog used by checkout, and to fresh-install seed/fallback values. Existing invoices are preserved. Existing Stripe subscriptions, if configured later, keep their provider-side contract until explicitly changed; editing the catalog does not modify a running Stripe subscription.

Annual equivalents: Starter ฿291.67/month, saving ฿1,180/year against 12 monthly payments. Pro ฿625/month, saving ฿1,980/year. The old flat 17% savings claim was removed; UI computes savings from current catalog values.

Landing page now states the product category, target shop types, actual cashier tasks, table/QR-to-kitchen flow, and BOM stock flow. Each feature section uses a screenshot of the real local application with clearly labeled test data. The original visual system and supplied assets are preserved within pos.buzlike; no demo-system files were accessed or changed for this update.

Starter provides counter sales, modifiers, cash/PromptPay/manual card recording, Thai receipts, held bills, discounts, split payments, cashier shifts/PIN, direct-unit stock and CSV reports. Pro includes Starter and adds kitchen display/stations/timers, table management/move/merge, public table QR ordering/calls, and recipe-based ingredient deduction. Three branches and larger quotas are additional differences, not the only difference. Comparison table lists both included and excluded capabilities explicitly.

Existing server guards already restricted kitchen, table operations, QR menu access, and recipe mutations. This update additionally blocks assigning a table through the generic order-creation endpoint when QR/table entitlement is absent. Starter inventory links to the Pro upgrade rather than opening a recipe editor it cannot save.

Verification: production build and TypeScript; PostgreSQL catalog-price check; billing activation checks all three feature rights for Starter/Pro; HTTP test denies Starter kitchen/table/BOM and table-order bypass, then verifies Pro table QR/recipe access. Browser checks cover monthly/yearly prices, savings, comparison rows, feature anchors, visible screenshots and desktop/mobile layout.

Verified on the running production build: 16 tests passed; monthly 390/790 and annual 3,500/7,500 visible; savings 1,180/1,980; 3 feature sections and 10 comparison rows; all screenshot assets decode after scrolling; feature anchor works; no document overflow at 390×844. Captures in docs/evidence: landing-updated-desktop.png, landing-updated-mobile.png, pricing-updated-desktop.png, pricing-updated-mobile.png, plan-comparison-desktop.png and features-updated-desktop.png. Inspected desktop/mobile rendered screenshots for typography, palette, layout, copy, image loading and comparison states. Changes retain the existing visual system; new feature copy/sections are the requested additions.
