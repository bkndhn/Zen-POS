-- Migration: Add calci_shortcodes column to shop_settings table
-- This adds a jsonb column for storing calci shortcode mappings across devices
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS calci_shortcodes JSONB DEFAULT '{}'::jsonb;
