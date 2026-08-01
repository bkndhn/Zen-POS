-- Add missing columns to shop_settings table
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS google_review_url TEXT,
  ADD COLUMN IF NOT EXISTS visible_nav_pages JSONB DEFAULT '[]'::jsonb;
