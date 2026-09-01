ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS promo_reel_url text,
ADD COLUMN IF NOT EXISTS promo_reel_image_url text;
