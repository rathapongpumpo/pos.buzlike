-- Regular prices for every customer. Pilot grants and financial history are untouched.
UPDATE "Plan" SET "price" = 199 WHERE "code" = 'STARTER_MONTHLY';
UPDATE "Plan" SET "price" = 1990 WHERE "code" = 'STARTER_YEARLY';
UPDATE "Plan" SET "price" = 499 WHERE "code" = 'PRO_MONTHLY';
UPDATE "Plan" SET "price" = 4990 WHERE "code" = 'PRO_YEARLY';
