-- Force all shop_settings to be 'restaurant' business type
-- (profiles table does not have a business_type column)

UPDATE public.shop_settings
SET business_type = 'restaurant'
WHERE business_type IS NULL OR business_type != 'restaurant';
