-- Migration: Separate payment control for table/dine-in QR orders
-- Applied: 2026-10-03

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS require_payment_before_table_order BOOLEAN DEFAULT false;
