-- Add business_type and enabled_modules to shop_settings

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'restaurant',
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{"kds": true, "tables": true, "inventory": true}'::jsonb;
