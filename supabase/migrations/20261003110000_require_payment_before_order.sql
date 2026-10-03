-- Add require_payment_before_order toggle to shop_settings
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS require_payment_before_order BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.shop_settings.require_payment_before_order IS
  'When true, customers on public menu must pay online before their order is confirmed';
