ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'restaurant',
  ADD COLUMN IF NOT EXISTS auto_cut boolean NOT NULL DEFAULT true;