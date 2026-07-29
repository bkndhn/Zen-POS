-- Add UNIQUE constraint on customers(admin_id, phone) for ON CONFLICT DO UPDATE
ALTER TABLE public.customers 
  DROP CONSTRAINT IF EXISTS customers_admin_phone_unique;

ALTER TABLE public.customers 
  ADD CONSTRAINT customers_admin_phone_unique UNIQUE (admin_id, phone);

-- Update RLS policies on customers table to allow public insert/update (for public menu remote orders)
DROP POLICY IF EXISTS "customers_anon_insert_update" ON public.customers;
DROP POLICY IF EXISTS "customers_public_all" ON public.customers;

CREATE POLICY "customers_public_all" ON public.customers
  FOR ALL USING (true) WITH CHECK (true);
