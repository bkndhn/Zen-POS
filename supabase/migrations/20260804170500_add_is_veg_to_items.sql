-- Add veg/non-veg indicator to items table (Indian restaurant standard)
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS is_veg boolean DEFAULT true;

-- Set all existing items to veg by default
UPDATE public.items SET is_veg = true WHERE is_veg IS NULL;
