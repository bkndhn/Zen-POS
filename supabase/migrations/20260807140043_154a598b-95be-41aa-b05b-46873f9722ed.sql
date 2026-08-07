-- 1. Gateway credentials (per client / per branch)
CREATE TABLE public.payment_gateway_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  provider text NOT NULL CHECK (provider IN ('razorpay','phonepe')),
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  key_id text,
  key_secret text,
  webhook_secret text,
  merchant_id text,
  salt_key text,
  salt_index text DEFAULT '1',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_id, branch_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_credentials TO authenticated;
GRANT ALL ON public.payment_gateway_credentials TO service_role;

ALTER TABLE public.payment_gateway_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner admin manages own gateway credentials"
ON public.payment_gateway_credentials FOR ALL TO authenticated
USING (admin_id = public.get_my_admin_id() AND public.is_admin_or_super())
WITH CHECK (admin_id = public.get_my_admin_id() AND public.is_admin_or_super());

CREATE TRIGGER trg_pgc_updated_at BEFORE UPDATE ON public.payment_gateway_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Payment transactions
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  provider text NOT NULL,
  purpose text NOT NULL DEFAULT 'order' CHECK (purpose IN ('order','subscription')),
  reference_type text,
  reference_id uuid,
  customer_name text,
  customer_phone text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','expired','refunded','cancelled')),
  provider_link_id text,
  provider_order_id text,
  provider_payment_id text,
  short_url text,
  method text,
  utr text,
  error_message text,
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pay_txn_admin ON public.payment_transactions (admin_id, created_at DESC);
CREATE INDEX idx_pay_txn_link ON public.payment_transactions (provider_link_id);
CREATE INDEX idx_pay_txn_order ON public.payment_transactions (provider_order_id);
CREATE INDEX idx_pay_txn_ref ON public.payment_transactions (reference_id);

GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own payment transactions"
ON public.payment_transactions FOR SELECT TO authenticated
USING (admin_id = public.get_my_admin_id() OR public.is_super_admin());

CREATE TRIGGER trg_pay_txn_updated_at BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Recurring mandates (UPI Autopay / subscriptions)
CREATE TABLE public.payment_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  provider text NOT NULL,
  provider_plan_id text,
  provider_subscription_id text,
  provider_customer_id text,
  amount numeric NOT NULL DEFAULT 0,
  interval_months integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','active','paused','halted','cancelled','completed')),
  short_url text,
  next_charge_at timestamptz,
  last_charged_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pay_mandate_admin ON public.payment_mandates (admin_id);
CREATE INDEX idx_pay_mandate_sub ON public.payment_mandates (provider_subscription_id);

GRANT SELECT ON public.payment_mandates TO authenticated;
GRANT ALL ON public.payment_mandates TO service_role;

ALTER TABLE public.payment_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own mandates"
ON public.payment_mandates FOR SELECT TO authenticated
USING (admin_id = public.get_my_admin_id() OR public.is_super_admin());

CREATE TRIGGER trg_pay_mandate_updated_at BEFORE UPDATE ON public.payment_mandates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Shop settings: WhatsApp ordering configuration
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS whatsapp_ordering_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_ordering_mode text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS whatsapp_order_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_auto_send_payment_link boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_payment_gateway text DEFAULT 'razorpay';

-- 5. Remote orders: payment link tracking
ALTER TABLE public.remote_orders
  ADD COLUMN IF NOT EXISTS payment_link_url text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- 6. Subscription payments: link to gateway transaction
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS gateway_txn_id uuid,
  ADD COLUMN IF NOT EXISTS gateway_provider text;