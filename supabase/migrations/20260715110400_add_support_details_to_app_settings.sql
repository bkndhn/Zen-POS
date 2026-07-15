-- Migration: Add Super Admin Support details to app_settings
-- Created: 2026-07-15

ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_whatsapp text,
  ADD COLUMN IF NOT EXISTS support_custom_details text,
  ADD COLUMN IF NOT EXISTS show_support_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_support_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_support_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_support_custom boolean NOT NULL DEFAULT true;
