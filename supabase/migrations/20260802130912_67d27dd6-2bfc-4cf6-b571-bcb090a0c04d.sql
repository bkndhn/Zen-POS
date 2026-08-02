ALTER TABLE public.items ADD COLUMN IF NOT EXISTS barcode text;
CREATE INDEX IF NOT EXISTS items_barcode_idx ON public.items (admin_id, barcode) WHERE barcode IS NOT NULL;