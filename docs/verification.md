# Verification — 5 November 2026 (Asia/Bangkok)

## Update — 8 November 2026, real SMTP

Hostinger SMTP authentication and two real outbox sends passed: one scoped test and one dispatched automatically by the running background worker. Exact Message-IDs were found in the designated support mailbox's INBOX using read-only IMAP; both messages reported SPF/DKIM/DMARC pass. App rebuilt/restarted and worker is running locally. Worker regression/typecheck/build passed this round; earlier full-suite results remain dated snapshots. See [real SMTP report](phases/smtp-live.md) and its redacted JSON evidence. No other mailbox messages were read or modified.

## Update — 8 November 2026, Phase 2

Production build/typecheck and 38/38 tests passed. New accounts verify email; reset links invalidate old sessions; owner invitations bind email/role/branches; onboarding saves metadata and deduplicates retries. Local SMTP and concurrent workers were exercised in an isolated database schema. In-app browser evidence covers mobile/tablet recovery, verification, invitation forms and draft reload. Existing domain counts/totals match the Phase 2 backup after fixture cleanup. Real SMTP remains unconfigured (`email:worker -- --once` reported `not_configured`); production deliverability is not verified. See [Phase 2 report](phases/phase-2.md).

## Update — 8 November 2026, Phase 1

Production build and typecheck passed; 32/32 automated tests passed. Branch grants, branch prices/unit stocks, sale/refund isolation, live revocation, scoped offline replay and service-worker cache, and multi-branch export/import are implemented. Mobile and tablet branch/grant/held-sale flows were checked in Codex's in-app browser. Original domain counts/totals match the pre-migration snapshot after fixture cleanup. See [Phase 1 report](phases/phase-1.md) for evidence and limits; real disconnected-network testing of the new scope, backup restore, provider and production tests remain pending. Earlier sections below are dated historical results, not proof of the changed implementation.

## Automated checks

- TypeScript strict check passed.
- Next.js 15 optimized production build passed.
- `npm test`: 14 tests passed, including real PostgreSQL transactions and HTTP calls to the running app.
- `npm audit`: zero known vulnerabilities after upgrading Auth.js/Zod/Nodemailer and overriding patched PostCSS/deepmerge-ts.
- No external payment, Google OAuth, SMTP delivery, Redis server, DNS, or live hosting was exercised. Docker files are supplied but Docker daemon was unavailable on this machine.

Domain/HTTP coverage: inclusive/exclusive VAT and rounding; trial/grace/lifetime/suspension; signed staff cookie tampering; PromptPay validation; 10-product/6-table seeding; modifiers and authoritative prices; duplicate request/hash protection; stock deduction/return; cross-tenant and role denial; missing session; origin rejection; webhook fail-closed; shift required/duplicate shifts; insufficient cash; double void protection; QR token expiry after settlement; report export entitlement and UTF-8 BOM; read-only checkout denial; cashier PIN privilege reduction; cash close variance; atomic billing activation and duplicate activation; complete export/import into an isolated empty PostgreSQL schema.

## Browser evidence

Primary workflow was tested in the in-app browser. After server restarts its old localhost tab became unreliable; a fresh 127.0.0.1 tab worked. Playwright CLI was then used for reproducible file screenshots, exact viewport sizing, offline emulation, print media/PDF, and multi-tab realtime verification.

Verified flows:

1. Register QA account → onboarding all three steps → automatically seeded shop → open shift with ฿1,000.
2. Latte ฿75 + oat milk ฿20 + croissant ฿85 → ฿180 total, included VAT ฿11.78, cash received ฿200, change ฿20 → persisted receipt → kitchen ticket.
3. Hold and restore bill → network offline → cash croissant ฿85, receive ฿100, change ฿15 → temporary offline receipt → reload POS while offline → network online → durable order visible in history.
4. Open table → customer menu on 390 × 844 viewport → order croissant and cake → second kitchen tab receives new ticket automatically → settle table → old QR token invalidated.
5. Close offline QA shift: starting ฿1,000 + paid sales ฿265 = expected ฿1,265; actual ฿1,265; variance ฿0.00.
6. All nine additional owner backoffice screens loaded on mobile without horizontal document overflow; data tables scroll inside their containers.
7. Super Admin shop list, payments and plan/coupon screens loaded under an authorized admin session. Non-admin API access was denied in HTTP tests.
8. Browser print media contains Thai receipt text and excludes application chrome. `receipt-80mm.pdf` was generated; physical thermal printers have not been tested.

Evidence files: `pos-desktop.png`, `pos-mobile.png`, `offline-receipt.png`, `synced-order.png`, `receipt-online.png`, `receipt-print.png`, `receipt-80mm.pdf`, `qr-mobile.png`, `kds-realtime.png`, `dashboard-desktop.png`, `superadmin.png`, `z-report.png`, under `docs/evidence/`.

## Design comparison ledger

Primary reference `docs/design/pos-concept.png` and latest desktop/browser screenshots were both opened with `view_image`, at the native 1536 × 1024 viewport; mobile screenshot was inspected at 390 px width.

| Point | Reference / implementation inspection | Result |
|---|---|---|
| Composition | Navy rail, white top bar, 3-column menu, right cart | Preserved; cart increased to 450 px after comparison |
| Typography | Thai heading hierarchy and menu readability | Increased desktop menu labels to 18 px, nav to 18 px, title to 36 px and cart heading to 32 px |
| Palette | Navy/teal/cool gray/white surfaces | Preserved; no warm background tint or image overlay |
| Product assets | Consistent café photography with light tabletop | Generated accurate iced latte/cocoa assets after incorrect generic beverage mapping was found |
| Copy | Navigation, search, categories, totals, checkout | Matched SRS; additional delivery/shift/offline/hold controls are intentional requirements |
| Borders and controls | Thin gray borders, restrained radii, outline icons | Shared tokens, Button primitive, Radix dialogs and Lucide icons |
| Responsive | Desktop rail collapses to scrollable mobile bottom navigation | All primary content stays inside viewport; tables have local scrolling |
| Receipt | Thai text, VAT, actual tender/change, no app chrome in print | Screen and print captures inspected |

Above-the-fold copy review found only intentional SRS additions: trial banner, connection/operator status, delivery, shift, CFD, count, hold/restore/clear, and empty-cart text. The seeded 10th product, real data, compact typography, and responsive behavior are documented deviations from the illustrative concept. Visual system was compared and corrected against the concept; this is not a claim of pixel-identical reproduction of rasterized Thai text or sample cart data.

## Remaining external dependencies / limits

- Configure real Stripe and signed webhook, company PromptPay, SMTP and optional Google OAuth before enabling those integrations. Live provider E2E and recipient delivery remain unverified.
- Slip approval is manual; automatic bank-slip vendor and LINE alerts are not configured.
- SaaS receipt is printable HTML; formal e-Tax issuance requires issuer data/provider setup.
- CFD synchronizes tabs on the same browser profile. A remotely hosted second-device CFD transport is not implemented.
- Current platform analytics show MRR/ARR, paid package totals and account-state counts; historical churn/cohort analytics and paid extra-branch add-ons are not implemented.
- Quota for a new POS terminal is checked on sale creation. Owner can release a registered device slot from settings.
- Offline business conflicts remain in the queue for review; closed shifts or changed server prices must be resolved before retrying. Offline estimates do not silently override server amounts.
- Source, migrations, scripts and Docker configuration are ready for deployment preparation. No claim of production deployment or physical-printer certification is made.

Only `D:\Projects\pos.buzlike` was written. The `demo-system` project was read early for brand assets and was not modified.

## 2026-11-05 — Self-service reanalysis and empty onboarding

- New governing design: `docs/architecture/pos-saas-v2.md`; executable database blueprint: `docs/architecture/pos-saas-v2.sql` (52 tables). This is a reviewed design baseline, not an applied Prisma migration or a completed v2 application.
- Replaced sample provisioning in `/api/onboarding` with `provisionEmptyTenant`. New organizations contain one branch and one owner, with zero products/categories/ingredients/modifiers/tables/orders. Existing demo/test fixtures still explicitly call `seedTenantTemplate`; existing stores were not reset.
- Onboarding requires a PIN chosen by the customer; VAT initially defaults to NONE. Completion opens Products with guidance to add a category and the first product.
- `npm run build` and strict type checking passed. `npm test`: 18 tests passed, including HTTP empty onboarding + owner-created category/product/price, and the isolated PostgreSQL v2 design test.
- The design test creates all blueprint tables in a transaction-local temporary schema, verifies tenant and branch foreign keys, independent branch stock/prices, nonnegative stock, order/webhook deduplication, invoice ownership and refund-line provenance, then rolls back and verifies the schema is absent. It does not replace the application's public schema or prove application services/RLS/load capacity.
- Browser: register with a new email/password → three onboarding steps → retail profile / no VAT / customer-chosen PIN → Products shows 0 items → add a category → add a product at ฿45.50 with 20 units. No admin intervention in this local trial flow. Real payment activation was not tested in this pass.
- Browser evidence: `output/playwright/v2-onboarding/empty-store.png`, `own-product.png`, `own-product-mobile.png`. Desktop 1440×1000 and mobile 390×844 inspected.
- Remaining v2 implementation is explicitly listed in section 9 of the new design: production migration, branch permissions/inventory, full self-service payment/account lifecycle, promotions/CRM/transfers, provider E2E and deployment.

## 2026-11-06 — Signup, PIN keypad, mobile-first and tablet layouts

Implemented:

- Signup asks only email, password and confirmation, with an explicit home link and show/hide. API normalizes email, requires matching passwords and stores only the hash plus a generic owner role label; personal name/phone are not collected. Existing users are preserved.
- Setup asks shop name/type, then sets and confirms a PIN through a shared numeric keypad. Server generates the shop URL; PromptPay/VAT move to settings. Wrong PIN confirmation creates no tenant. OWNER can rename the shop without changing its slug.
- Keypad component is also used in staff setup and operator switching. It supports touch buttons, hardware number keys, Backspace, Delete, hide/reveal, 4–6 digits, no automatic submit and no editable text input that opens a phone keyboard.
- Auth/setup CSS now starts with a narrow single-column layout, adds a two-column PIN layout at 680px, and a brand panel at 1024px. Digit targets are at least 56×56 CSS px (64px tall on wider layouts); primary/secondary controls are at least 48px tall.
- Current official references were checked: W3C WCAG 2.2 Target Size Enhanced, Android/Material accessibility, MDN Responsive Web Design and web.dev Macro Layouts. Source links and design decisions are in `signup-onboarding-ux-plan.md`.
- Strict typecheck and production build passed. All 19 tests passed, including mismatched signup passwords, normalized/duplicate email, empty onboarding, mismatched PIN rejection, stable URL after shop rename and existing POS regressions.

Browser workflow evidence:

- Initial signup checks: direct Back → home; email/password/confirmation only; mismatch focuses confirmation and sends no registration request; correcting it signs in and opens onboarding. Signup desktop/mobile captures are in `output/playwright/signup-ux/`.
- User requested the Codex right-side browser. All subsequent keypad and responsive checks use the in-app browser; no further external browser windows are opened. The right-side tab is retained as the deliverable.
- Keypad checks in that browser: 3 digits cannot continue; 4 can; hardware input stops at 6; Backspace removes one, Delete/clear resets; reveal/hide toggles; confirmation mismatch stays in setup; matching confirmation enables creation. This UI check intentionally does not create a business in the user's signed-in account; actual creation/mismatch persistence is covered by isolated HTTP tests.
- Viewport results and final images are saved under `output/playwright/signup-ux/`. Narrow screens may scroll vertically; no promise that a touch keypad fits completely inside every short landscape viewport is made. Real iOS/Android hardware testing remains separate from browser viewport checks.
- Final right-panel viewport run: **13/13 PIN layouts and 13/13 shop-details layouts passed**, covering 320/360/390/430px phones, 667px landscape, 679/680px boundary, 768/820px tablets, 1023/1024px boundary, and 1280/1440px desktops. Each run verifies actual viewport dimensions before accepting its measurement. No document horizontal overflow, overlapping PIN panels, digit targets below 56px, or primary controls below 48px were found.
- Machine-readable geometry: `pin-viewport-checks.json`, `shop-viewport-checks.json`. Inspected final screenshots: `pin-mobile-final.png`, `pin-tablet-final.png`, `pin-desktop-final.png`. Viewport override was reset after testing and the right-side tab was retained. These captures show a disposable, unsaved setup draft rather than a business created in the user's account.
- New schema v2, full provider billing, recovery tokens and draft/idempotency work remain as described in the plan, not implied complete by these UX changes.

## 2026-11-06 — Onboarding layout cleanup

- Setup now uses a short brand bar and a centered card. Back navigation and step count share a separate toolbar; heading, progress and form have clear spacing and dividers. Account signup/login retain their existing layout.
- PIN context and keypad use two columns from 680px, with the primary action aligned directly beneath the keypad. Narrow screens use one column. Compact tablet landscape spacing preserves digit targets of at least 56px.
- Production build, strict typecheck and all 19 tests passed after the changes.
- Right-side in-app browser: 13/13 PIN viewport checks and 7/7 shop-details checks passed. Checks cover horizontal overflow, toolbar separation, primary control height and PIN/keypad alignment. At 1024x768 the complete PIN page fits vertically; short phone viewports can scroll.
- Evidence in `output/playwright/signup-ux/`: `tidy-pin-layout-checks.json`, `tidy-shop-layout-checks.json`, `tidy-pin-mobile.png`, `tidy-pin-tablet.png`, `tidy-pin-desktop.png`. Mobile, tablet and desktop captures were visually inspected. Viewport override was reset and the existing right-side tab retained; the shop draft was not submitted.

### Progress copy correction

- Removed the two-circle step strip and duplicate counter after user feedback that their meaning was unclear. A single plain-language step label now precedes the heading; the shop page states the next action, and its button reads “ถัดไป: ตั้งรหัส PIN”. The PIN page explains whose PIN it is and what it does.
- Production build (including type validation) passed. In-app browser checks passed for both pages at 320, 390, 768, 1024 and 1440px widths: current/next copy present, old strip absent, no document horizontal overflow. Forward/back navigation was checked without submitting a shop or PIN.
- Evidence: `clear-progress-checks.json`, `clear-shop-progress-mobile.png`, `clear-pin-progress-tablet.png` in `output/playwright/signup-ux/`. Mobile shop and tablet PIN screenshots were visually inspected. The right-side tab remains on the empty shop form with viewport override reset.

## 2026-11-06 — Account entry and whole-journey audit

- Full findings, fixes and remaining work: `docs/account-journey-audit.md`. Public CTA state now comes from the authenticated account; login/register guard signed-in users; entry handles no stores, empty stores, multiple stores, role-specific destinations and explicit additional-store setup.
- Session checks cover mount, route changes, popstate, focus and pageshow. Logout clears the account and operator cookies, removes cached account catalogs without deleting unsynced sales/held bills, and returns to the same origin. Permission/feature errors have an exit to the store picker instead of billing loops.
- Production build including type validation passed. The complete automated suite passed 25/25 tests, including six new account-journey groups with real credentials/CSRF requests and post-logout access checks. Final client session/back and same-origin logout adjustments were then verified through the in-app browser.
- Same right-side browser tab, disposable fixture account on `127.0.0.1:3100`: login → choose one of two stores → empty Products → add category/product at 45 baht with stock 10 → open shift → cash sale (received 50, change 5) → receipt. No real gateway payment or physical print was executed.
- Read-only navigation checks covered 10 backoffice pages at mobile/tablet/desktop. The initial pass found a dashboard chart expanding the mobile document; after correction it passed 320/390/768/1024/1440px. The chart now scrolls locally and trial CSV respects export entitlement. Other corrections include tablet hero composition, mobile page-title/action grouping and duplicate button outlines.
- Final public/setup responsive pass: 13/13 home layouts, 5/5 shop-details layouts and 5/5 PIN layouts passed. No guest login/register links appeared on the signed-in home; no document horizontal overflow or nav collisions; PIN keys remained at least 56px tall. Browser Back after logout showed a login form and no private test-store shell/picker. Direct return to localhost verified the original account still signed in with setup links.
- Evidence: `output/playwright/account-journey/` contains `account-responsive-final.json`, `backoffice-read-checks.json` (initial failure retained), `dashboard-final-checks.json`, `logout-back-final.json`, screenshots of the picker/empty store/test receipt and final home/tablet/mobile layouts. The viewport override was reset and the original localhost home retained in the right panel. All setup drafts entered in the original account were cleared without submission.
- Remaining provider, recovery, onboarding idempotency/draft and v2 migration work is listed explicitly in the audit. This pass does not certify every backoffice mutation, hardware device, production deployment or real provider lifecycle.
- Disposable browser fixture account, its two stores and test sale/shift were removed after verification. The cleanup checks fixture identity/ownership and deletes sale references before catalog/staff; no existing business data is targeted.
