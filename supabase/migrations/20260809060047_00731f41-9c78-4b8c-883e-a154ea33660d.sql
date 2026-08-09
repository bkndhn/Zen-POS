CREATE TABLE IF NOT EXISTS public.payment_platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  mode text NOT NULL DEFAULT 'test',
  key_id text,
  key_secret text,
  webhook_secret text,
  merchant_id text,
  salt_key text,
  salt_index text DEFAULT '1',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, mode)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_platform_credentials TO authenticated;
GRANT ALL ON public.payment_platform_credentials TO service_role;

ALTER TABLE public.payment_platform_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages platform gateway"
  ON public.payment_platform_credentials FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_ppc_updated_at
  BEFORE UPDATE ON public.payment_platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  scope text NOT NULL DEFAULT 'tenant',
  admin_id uuid,
  event_id text NOT NULL,
  event_type text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads webhook events"
  ON public.payment_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE TRIGGER trg_pwe_updated_at
  BEFORE UPDATE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pwe_status ON public.payment_webhook_events (status, next_retry_at);

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

ALTER TABLE public.payment_mandates
  ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'test';

CREATE INDEX IF NOT EXISTS idx_ptx_admin_created ON public.payment_transactions (admin_id, created_at DESC);