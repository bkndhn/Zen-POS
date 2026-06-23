-- Add Zomato/Swiggy pricing to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS price_zomato numeric,
ADD COLUMN IF NOT EXISTS price_swiggy numeric;

-- Add channel column to bills table
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS channel text DEFAULT 'store';

-- Backfill channel column for existing bills
UPDATE public.bills SET channel = 'store' WHERE channel IS NULL;
