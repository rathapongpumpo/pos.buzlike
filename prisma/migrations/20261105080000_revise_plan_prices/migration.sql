-- Updated owner-approved prices. Historical invoices and payments are preserved.
UPDATE "Plan" SET "price" = 390 WHERE "code" = 'STARTER_MONTHLY';
UPDATE "Plan" SET "price" = 3500 WHERE "code" = 'STARTER_YEARLY';
UPDATE "Plan" SET "price" = 790 WHERE "code" = 'PRO_MONTHLY';
UPDATE "Plan" SET "price" = 7500 WHERE "code" = 'PRO_YEARLY';
