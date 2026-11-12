-- BUZLIKE v2 PostgreSQL 17 design blueprint, 2026-11-05.
-- NOT an application migration. Run ONLY in an isolated schema/transaction.
-- No CREATE SCHEMA, SET search_path, seed data, roles, or destructive statements.
-- IDs are text to preserve existing CUIDs during migration.
-- Money = THB minor units (satang); quantities = exact base-unit decimals.
-- RESTRICT deletion is intentional. Business records are archived, not cascaded.

CREATE TABLE app_user (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL CHECK (email = lower(btrim(email))),
  password_hash text,
  full_name text, -- Optional profile data; email/password signup never requires it.
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE identity_token (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES app_user(id),
  purpose text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE organization (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_profile text NOT NULL CHECK (business_profile IN ('CAFE', 'RESTAURANT', 'RETAIL', 'MIXED')),
  onboarding_step text NOT NULL DEFAULT 'CATALOG',
  billing_name text,
  billing_tax_id text,
  billing_address text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_member (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES app_user(id),
  display_name text NOT NULL,
  organization_role text NOT NULL DEFAULT 'MEMBER' CHECK (organization_role IN ('OWNER', 'ADMIN', 'MEMBER')),
  pin_hash text,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_member_user ON organization_member(user_id) WHERE active;

CREATE TABLE branch (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  business_day_start time NOT NULL DEFAULT '00:00',
  address text,
  receipt_settings jsonb NOT NULL DEFAULT '{}',
  tax_settings jsonb NOT NULL DEFAULT '{"mode":"NONE"}',
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE branch_access (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  member_id text NOT NULL,
  branch_role text NOT NULL CHECK (branch_role IN ('MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'INVENTORY')),
  PRIMARY KEY (organization_id, branch_id, member_id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id),
  FOREIGN KEY (organization_id, member_id) REFERENCES organization_member(organization_id, id)
);

CREATE TABLE staff_invitation (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  email text NOT NULL CHECK (email = lower(btrim(email))),
  invited_by text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  grants jsonb NOT NULL, -- Validated branch IDs/roles; recheck them when accepting.
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, invited_by) REFERENCES organization_member(organization_id, id)
);

CREATE TABLE business_module (
  organization_id text NOT NULL REFERENCES organization(id),
  module_code text NOT NULL CHECK (module_code IN ('RETAIL', 'TABLES', 'KDS', 'QR_ORDER', 'RECIPE', 'PROMOTIONS', 'CRM')),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, module_code)
); -- Module enabled AND subscription entitled are both required by the server.

CREATE TABLE plan_version (
  id text PRIMARY KEY,
  plan_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('MONTH', 'YEAR', 'ONCE')),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  features jsonb NOT NULL,
  quotas jsonb NOT NULL,
  available_for_purchase boolean NOT NULL DEFAULT true,
  UNIQUE (plan_code, version)
); -- Immutable commercial snapshot; new pricing creates a new version.

CREATE TABLE subscription (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  status text NOT NULL CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED', 'CANCELED', 'LIFETIME_ACTIVE')),
  provider text,
  provider_subscription_id text,
  provider_customer_id text,
  trial_ends_at timestamptz,
  period_start timestamptz,
  paid_through timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  ended_at timestamptz,
  revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, id),
  UNIQUE (provider, provider_subscription_id),
  CHECK (period_start IS NULL OR paid_through IS NULL OR paid_through >= period_start)
);
CREATE UNIQUE INDEX subscription_one_live ON subscription(organization_id) WHERE ended_at IS NULL;

CREATE TABLE subscription_item (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  subscription_id text NOT NULL,
  plan_version_id text NOT NULL REFERENCES plan_version(id),
  item_code text NOT NULL, -- BASE / EXTRA_BRANCH / HOSTING; separate license from hosting.
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, subscription_id, item_code),
  FOREIGN KEY (organization_id, subscription_id) REFERENCES subscription(organization_id, id)
);

CREATE TABLE entitlement_override (
  organization_id text NOT NULL REFERENCES organization(id),
  feature_code text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz,
  reason text NOT NULL,
  PRIMARY KEY (organization_id, feature_code)
);

CREATE TABLE billing_invoice (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  subscription_id text,
  invoice_number text NOT NULL UNIQUE,
  cycle_key text NOT NULL, -- initial attempt UUID or stable provider subscription/period key.
  status text NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor = subtotal_minor - discount_minor + tax_minor),
  customer_snapshot jsonb NOT NULL,
  service_period_start timestamptz,
  service_period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, cycle_key),
  FOREIGN KEY (organization_id, subscription_id) REFERENCES subscription(organization_id, id)
);

CREATE TABLE billing_invoice_line (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  invoice_id text NOT NULL,
  description text NOT NULL,
  plan_version_id text REFERENCES plan_version(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES billing_invoice(organization_id, id)
);

CREATE TABLE payment_attempt (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  invoice_id text NOT NULL,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  provider text NOT NULL,
  provider_checkout_id text,
  provider_payment_id text,
  method text NOT NULL CHECK (method IN ('CARD', 'GATEWAY_PROMPTPAY')),
  status text NOT NULL CHECK (status IN ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, request_key),
  UNIQUE (provider, provider_checkout_id),
  UNIQUE (provider, provider_payment_id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES billing_invoice(organization_id, id)
);

-- Platform ingress: organization may be unknown until the resource is verified.
CREATE TABLE billing_webhook_inbox (
  provider text NOT NULL,
  provider_account text NOT NULL,
  event_id text NOT NULL,
  organization_id text REFERENCES organization(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  PRIMARY KEY (provider, provider_account, event_id)
);
CREATE INDEX billing_inbox_pending ON billing_webhook_inbox(available_at) WHERE processed_at IS NULL;

CREATE TABLE category (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE product (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  category_id text NOT NULL,
  name text NOT NULL,
  image_key text,
  archived_at timestamptz,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, category_id) REFERENCES category(organization_id, id)
);

CREATE TABLE stock_item (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sku text NOT NULL,
  name text NOT NULL,
  base_unit text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('FINISHED', 'INGREDIENT', 'PACKAGING')),
  archived_at timestamptz,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, sku)
);

CREATE TABLE product_variant (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  product_id text NOT NULL,
  sku text NOT NULL,
  barcode text,
  name text NOT NULL DEFAULT 'มาตรฐาน',
  attributes jsonb NOT NULL DEFAULT '{}',
  default_price_minor bigint NOT NULL CHECK (default_price_minor >= 0),
  stock_mode text NOT NULL DEFAULT 'NONE' CHECK (stock_mode IN ('NONE', 'DIRECT', 'RECIPE')),
  stock_item_id text,
  base_units_per_sale numeric(18,6) NOT NULL DEFAULT 1 CHECK (base_units_per_sale > 0),
  archived_at timestamptz,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, sku),
  FOREIGN KEY (organization_id, product_id) REFERENCES product(organization_id, id),
  FOREIGN KEY (organization_id, stock_item_id) REFERENCES stock_item(organization_id, id),
  CHECK ((stock_mode = 'DIRECT' AND stock_item_id IS NOT NULL) OR (stock_mode <> 'DIRECT' AND stock_item_id IS NULL))
);
CREATE INDEX variant_barcode ON product_variant(organization_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE branch_offer (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  variant_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('POS', 'QR', 'DELIVERY')),
  price_minor bigint CHECK (price_minor >= 0), -- null explicitly falls back to variant price.
  available boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, branch_id, variant_id, channel),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id),
  FOREIGN KEY (organization_id, variant_id) REFERENCES product_variant(organization_id, id)
);

CREATE TABLE modifier_group (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE modifier_option (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  group_id text NOT NULL,
  name text NOT NULL,
  price_delta_minor bigint NOT NULL DEFAULT 0 CHECK (price_delta_minor >= 0),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, group_id) REFERENCES modifier_group(organization_id, id)
);

CREATE TABLE product_modifier_group (
  organization_id text NOT NULL,
  product_id text NOT NULL,
  group_id text NOT NULL,
  PRIMARY KEY (organization_id, product_id, group_id),
  FOREIGN KEY (organization_id, product_id) REFERENCES product(organization_id, id),
  FOREIGN KEY (organization_id, group_id) REFERENCES modifier_group(organization_id, id)
);

CREATE TABLE recipe_component (
  organization_id text NOT NULL,
  variant_id text NOT NULL,
  stock_item_id text NOT NULL,
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  PRIMARY KEY (organization_id, variant_id, stock_item_id),
  FOREIGN KEY (organization_id, variant_id) REFERENCES product_variant(organization_id, id),
  FOREIGN KEY (organization_id, stock_item_id) REFERENCES stock_item(organization_id, id)
);

CREATE TABLE inventory_location (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('STORE', 'WAREHOUSE', 'IN_TRANSIT')),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id)
);

CREATE TABLE stock_balance (
  organization_id text NOT NULL,
  location_id text NOT NULL,
  stock_item_id text NOT NULL,
  quantity_base numeric(18,6) NOT NULL DEFAULT 0 CHECK (quantity_base >= 0),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, location_id, stock_item_id),
  FOREIGN KEY (organization_id, location_id) REFERENCES inventory_location(organization_id, id),
  FOREIGN KEY (organization_id, stock_item_id) REFERENCES stock_item(organization_id, id)
);

CREATE TABLE stock_transfer (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  source_location_id text NOT NULL,
  destination_location_id text NOT NULL,
  transit_location_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'DISPATCHED', 'PARTIAL', 'RECEIVED', 'CANCELED')),
  request_key text NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, request_key),
  FOREIGN KEY (organization_id, source_location_id) REFERENCES inventory_location(organization_id, id),
  FOREIGN KEY (organization_id, destination_location_id) REFERENCES inventory_location(organization_id, id),
  FOREIGN KEY (organization_id, transit_location_id) REFERENCES inventory_location(organization_id, id),
  CHECK (source_location_id <> destination_location_id AND transit_location_id <> source_location_id AND transit_location_id <> destination_location_id)
);

CREATE TABLE stock_transfer_line (
  organization_id text NOT NULL,
  transfer_id text NOT NULL,
  stock_item_id text NOT NULL,
  quantity_sent numeric(18,6) NOT NULL CHECK (quantity_sent > 0),
  quantity_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_sent),
  PRIMARY KEY (organization_id, transfer_id, stock_item_id),
  FOREIGN KEY (organization_id, transfer_id) REFERENCES stock_transfer(organization_id, id),
  FOREIGN KEY (organization_id, stock_item_id) REFERENCES stock_item(organization_id, id)
);

CREATE TABLE customer (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  phone text,
  email text,
  marketing_consent_at timestamptz,
  archived_at timestamptz,
  PRIMARY KEY (organization_id, id)
);
CREATE INDEX customer_phone ON customer(organization_id, phone);

CREATE TABLE promotion (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('PERCENT', 'FIXED', 'BUNDLE', 'BUY_X_GET_Y')),
  rules jsonb NOT NULL, -- Versioned, typed server schema; not arbitrary executable code.
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  stacking_group text NOT NULL DEFAULT 'EXCLUSIVE',
  usage_limit integer CHECK (usage_limit > 0),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, id),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE promotion_branch (
  organization_id text NOT NULL,
  promotion_id text NOT NULL,
  branch_id text NOT NULL,
  PRIMARY KEY (organization_id, promotion_id, branch_id),
  FOREIGN KEY (organization_id, promotion_id) REFERENCES promotion(organization_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id)
);

CREATE TABLE promotion_variant (
  organization_id text NOT NULL,
  promotion_id text NOT NULL,
  variant_id text NOT NULL,
  PRIMARY KEY (organization_id, promotion_id, variant_id),
  FOREIGN KEY (organization_id, promotion_id) REFERENCES promotion(organization_id, id),
  FOREIGN KEY (organization_id, variant_id) REFERENCES product_variant(organization_id, id)
);

CREATE TABLE terminal (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  device_key_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id)
);

CREATE TABLE cashier_shift (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  terminal_id text NOT NULL,
  member_id text NOT NULL,
  starting_cash_minor bigint NOT NULL CHECK (starting_cash_minor >= 0),
  actual_cash_minor bigint CHECK (actual_cash_minor >= 0),
  expected_cash_minor bigint,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, terminal_id) REFERENCES terminal(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, member_id) REFERENCES organization_member(organization_id, id),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX one_shift_per_terminal ON cashier_shift(organization_id, branch_id, terminal_id) WHERE closed_at IS NULL;

CREATE TABLE dining_zone (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id)
);

CREATE TABLE dining_table (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  zone_id text NOT NULL,
  name text NOT NULL,
  seats integer NOT NULL CHECK (seats > 0),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, branch_id, name),
  FOREIGN KEY (organization_id, branch_id, zone_id) REFERENCES dining_zone(organization_id, branch_id, id)
);

CREATE TABLE table_session (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  table_id text NOT NULL,
  qr_token_hash text NOT NULL UNIQUE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, table_id) REFERENCES dining_table(organization_id, branch_id, id),
  CHECK (expires_at > opened_at),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE UNIQUE INDEX one_session_per_table ON table_session(organization_id, branch_id, table_id) WHERE closed_at IS NULL;

CREATE TABLE sale (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  terminal_id text,
  shift_id text,
  member_id text,
  customer_id text,
  table_session_id text,
  client_order_id text NOT NULL,
  request_hash text NOT NULL,
  order_number text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('POS', 'QR', 'DELIVERY')),
  status text NOT NULL CHECK (status IN ('OPEN', 'PAID', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  business_date date NOT NULL,
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0), -- Before discount, excluding tax.
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor),
  service_minor bigint NOT NULL DEFAULT 0 CHECK (service_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor = subtotal_minor - discount_minor + service_minor + tax_minor),
  tax_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, client_order_id),
  UNIQUE (organization_id, branch_id, order_number),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branch(organization_id, id),
  FOREIGN KEY (organization_id, branch_id, terminal_id) REFERENCES terminal(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, shift_id) REFERENCES cashier_shift(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, member_id) REFERENCES organization_member(organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customer(organization_id, id),
  FOREIGN KEY (organization_id, branch_id, table_session_id) REFERENCES table_session(organization_id, branch_id, id)
);
CREATE INDEX sale_business_date ON sale(organization_id, branch_id, business_date, id);
CREATE INDEX sale_open ON sale(organization_id, branch_id, created_at) WHERE status = 'OPEN';

CREATE TABLE sale_line (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_id text NOT NULL,
  variant_id text NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor),
  service_minor bigint NOT NULL DEFAULT 0 CHECK (service_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor = subtotal_minor - discount_minor + service_minor + tax_minor),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, branch_id, sale_id, id),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, variant_id) REFERENCES product_variant(organization_id, id)
);

CREATE TABLE sale_line_modifier (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_line_id text NOT NULL,
  option_id text,
  name_snapshot text NOT NULL,
  delta_minor bigint NOT NULL CHECK (delta_minor >= 0),
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, sale_line_id) REFERENCES sale_line(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, option_id) REFERENCES modifier_option(organization_id, id)
);

CREATE TABLE sale_payment (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_id text NOT NULL,
  method text NOT NULL CHECK (method IN ('CASH', 'PROMPTPAY', 'CARD_RECORD', 'TRANSFER', 'GATEWAY')),
  request_key text NOT NULL,
  provider text,
  provider_payment_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0), -- Applied amount, excludes cash change.
  tendered_minor bigint CHECK (tendered_minor >= amount_minor),
  change_minor bigint NOT NULL DEFAULT 0 CHECK (change_minor >= 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REVERSED')),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, request_key),
  UNIQUE (provider, provider_payment_id),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id),
  CHECK (method <> 'CASH' OR (tendered_minor IS NOT NULL AND change_minor = tendered_minor - amount_minor))
);

CREATE TABLE sale_adjustment (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_id text NOT NULL,
  promotion_id text,
  reason text NOT NULL,
  rules_snapshot jsonb NOT NULL,
  allocation_snapshot jsonb NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  PRIMARY KEY (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, promotion_id) REFERENCES promotion(organization_id, id)
);

CREATE TABLE promotion_redemption (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  promotion_id text NOT NULL,
  sale_id text NOT NULL,
  customer_id text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  PRIMARY KEY (organization_id, promotion_id, branch_id, sale_id),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, promotion_id) REFERENCES promotion(organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customer(organization_id, id)
);

CREATE TABLE refund (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_id text NOT NULL,
  request_key text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
  provider_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, branch_id, sale_id, id),
  UNIQUE (organization_id, request_key),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id)
);

CREATE TABLE refund_line (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  refund_id text NOT NULL,
  sale_id text NOT NULL,
  sale_line_id text NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  restock boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, branch_id, refund_id, sale_line_id),
  FOREIGN KEY (organization_id, branch_id, sale_id, refund_id) REFERENCES refund(organization_id, branch_id, sale_id, id),
  FOREIGN KEY (organization_id, branch_id, sale_id, sale_line_id) REFERENCES sale_line(organization_id, branch_id, sale_id, id)
); -- Service locks original lines; sum refunded quantity/amount cannot exceed sold.

CREATE TABLE cash_movement (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  shift_id text NOT NULL,
  member_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  reason text NOT NULL,
  request_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, request_key),
  FOREIGN KEY (organization_id, branch_id, shift_id) REFERENCES cashier_shift(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, member_id) REFERENCES organization_member(organization_id, id)
);

CREATE TABLE stock_movement (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  location_id text NOT NULL,
  stock_item_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('OPENING', 'RECEIPT', 'SALE', 'RETURN', 'WASTE', 'ADJUST', 'TRANSFER')),
  quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta <> 0),
  balance_after numeric(18,6) NOT NULL CHECK (balance_after >= 0),
  operation_key text NOT NULL,
  reference_sale_id text,
  reference_refund_id text,
  transfer_id text,
  reversal_of text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, operation_key),
  UNIQUE (organization_id, reversal_of),
  FOREIGN KEY (organization_id, branch_id, location_id) REFERENCES inventory_location(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, stock_item_id) REFERENCES stock_item(organization_id, id),
  FOREIGN KEY (organization_id, branch_id, reference_sale_id) REFERENCES sale(organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id, reference_sale_id, reference_refund_id) REFERENCES refund(organization_id, branch_id, sale_id, id),
  FOREIGN KEY (organization_id, transfer_id) REFERENCES stock_transfer(organization_id, id),
  FOREIGN KEY (organization_id, reversal_of) REFERENCES stock_movement(organization_id, id),
  CHECK (reference_refund_id IS NULL OR reference_sale_id IS NOT NULL),
  CHECK (reversal_of IS NULL OR reversal_of <> id)
);
CREATE INDEX stock_ledger ON stock_movement(organization_id, location_id, stock_item_id, created_at, id);

CREATE TABLE kitchen_ticket (
  organization_id text NOT NULL,
  branch_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  sale_line_id text NOT NULL,
  station_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED', 'PREPARING', 'READY', 'SERVED', 'CANCELED')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, branch_id, id),
  UNIQUE (organization_id, branch_id, sale_line_id, station_code),
  FOREIGN KEY (organization_id, branch_id, sale_line_id) REFERENCES sale_line(organization_id, branch_id, id)
);
CREATE INDEX kitchen_active ON kitchen_ticket(organization_id, branch_id, station_code, queued_at) WHERE status IN ('QUEUED', 'PREPARING', 'READY');

CREATE TABLE loyalty_entry (
  organization_id text NOT NULL,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  customer_id text NOT NULL,
  branch_id text,
  sale_id text,
  points_delta bigint NOT NULL CHECK (points_delta <> 0),
  operation_key text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, operation_key),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customer(organization_id, id),
  FOREIGN KEY (organization_id, branch_id, sale_id) REFERENCES sale(organization_id, branch_id, id),
  CHECK ((branch_id IS NULL) = (sale_id IS NULL))
);
CREATE INDEX loyalty_customer ON loyalty_entry(organization_id, customer_id, created_at);

CREATE TABLE audit_event (
  organization_id text NOT NULL REFERENCES organization(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  actor_user_id text REFERENCES app_user(id),
  actor_member_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}', -- Redact passwords, tokens, provider secrets, PAN.
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, actor_member_id) REFERENCES organization_member(organization_id, id)
);
CREATE INDEX audit_timeline ON audit_event(organization_id, created_at, id);

-- Nullable org only for pre-onboarding identity mail, never for store data/jobs.
CREATE TABLE outbox_job (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text REFERENCES organization(id),
  kind text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  completed_at timestamptz,
  last_error text,
  CHECK (organization_id IS NOT NULL OR kind IN ('VERIFY_EMAIL', 'RESET_PASSWORD'))
);
CREATE INDEX outbox_pending ON outbox_job(available_at) WHERE completed_at IS NULL;

-- Runtime application/worker roles, RLS policies, grants, immutable-ledger guards,
-- typed promotion validation, PO/GR, provider reconciliation, privacy retention,
-- and production migration/backfill are separate reviewed implementation work.
-- This blueprint deliberately grants NO access and installs NO roles/extensions.
