-- Pharmacy Expansion Schema
-- Creates item_batches for tracking FEFO stock

CREATE TABLE IF NOT EXISTS public.item_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  batch_no text,
  expiry_date date,
  stock_quantity numeric DEFAULT 0,
  mrp numeric DEFAULT 0,
  purchase_rate numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS for item_batches
ALTER TABLE public.item_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for authenticated users" ON public.item_batches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for admin" ON public.item_batches FOR ALL USING (
  admin_id IN (
    SELECT admin_id FROM profiles WHERE user_id = auth.uid()
    UNION
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);
