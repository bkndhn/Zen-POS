ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS khata_balance numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.khata_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id uuid,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    type text NOT NULL CHECK (type IN ('credit', 'payment')),
    note text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Khata transactions SELECT"
    ON public.khata_transactions FOR SELECT
    USING (public.has_branch_read_access(admin_id, branch_id));

CREATE POLICY "Khata transactions INSERT"
    ON public.khata_transactions FOR INSERT
    WITH CHECK (public.has_branch_write_access(admin_id, branch_id));

CREATE POLICY "Khata transactions UPDATE"
    ON public.khata_transactions FOR UPDATE
    USING (public.has_branch_write_access(admin_id, branch_id));

CREATE POLICY "Khata transactions DELETE"
    ON public.khata_transactions FOR DELETE
    USING (public.has_branch_write_access(admin_id, branch_id));

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_khata_transactions_customer ON public.khata_transactions(customer_id);
