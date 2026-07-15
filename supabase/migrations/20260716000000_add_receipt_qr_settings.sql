ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS receipt_qr_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS receipt_qr_type text DEFAULT 'payment';
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS telegram text;

-- Allow values: payment, social
ALTER TABLE public.shop_settings ADD CONSTRAINT check_receipt_qr_type CHECK (receipt_qr_type IN ('payment', 'social'));
