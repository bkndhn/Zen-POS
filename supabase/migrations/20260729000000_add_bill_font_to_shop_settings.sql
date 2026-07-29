-- Migration: Add bill font family and scale to shop_settings

ALTER TABLE "public"."shop_settings" 
ADD COLUMN IF NOT EXISTS "bill_font_family" text,
ADD COLUMN IF NOT EXISTS "bill_font_scale" numeric;
