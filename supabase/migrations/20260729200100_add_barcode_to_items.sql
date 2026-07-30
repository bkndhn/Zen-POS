-- Add barcode and unit to items table for retail/pharmacy support

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'pcs';

-- Since barcode is used for quick scanning, indexing it is important for performance.
-- Also, it should theoretically be unique per branch, but we can just index it to speed up search.
CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items (barcode);
