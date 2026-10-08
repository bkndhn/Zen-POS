ALTER TABLE public.shop_settings 
  ADD COLUMN IF NOT EXISTS whatsapp_nightly_summary BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_nightly_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_nightly_time TEXT DEFAULT '23:00';
