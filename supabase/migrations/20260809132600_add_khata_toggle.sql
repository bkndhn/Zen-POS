-- Add khata_billing_enabled toggle to shop_settings
ALTER TABLE public.shop_settings 
  ADD COLUMN IF NOT EXISTS khata_billing_enabled BOOLEAN DEFAULT false;
