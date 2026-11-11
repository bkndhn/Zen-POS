-- P2: Analytics & tracking columns on shop_settings
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS ga_measurement_id text,
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS pwa_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chatbot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chatbot_greeting text DEFAULT 'Hi! 👋 Ask me anything about our menu!';
