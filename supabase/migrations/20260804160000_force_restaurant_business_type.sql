-- Force all existing profiles and shop_settings to be 'restaurant' business type
-- This ensures the backend and frontend are in perfectly locked sync for the Restaurant-only pivot.

-- Update shop settings
UPDATE public.shop_settings
SET business_type = 'restaurant'
WHERE business_type IS NULL OR business_type != 'restaurant';

-- Update user profiles
UPDATE public.profiles
SET business_type = 'restaurant'
WHERE business_type IS NULL OR business_type != 'restaurant';
