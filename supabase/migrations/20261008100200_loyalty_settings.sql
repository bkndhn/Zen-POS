ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS loyalty_earn_per_rupee NUMERIC DEFAULT 0.02; -- 1 point per ₹50
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS loyalty_redeem_rate NUMERIC DEFAULT 1.0; -- 1 point = ₹1
