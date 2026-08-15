DROP POLICY IF EXISTS "Users can view ledgers" ON public.customer_ledger;
DROP POLICY IF EXISTS "Users can insert ledgers" ON public.customer_ledger;

CREATE POLICY "Users can view ledgers" ON public.customer_ledger
    FOR SELECT USING (admin_id = public.get_user_admin_id());

CREATE POLICY "Users can insert ledgers" ON public.customer_ledger
    FOR INSERT WITH CHECK (admin_id = public.get_user_admin_id());

CREATE POLICY "Users can update ledgers" ON public.customer_ledger
    FOR UPDATE USING (admin_id = public.get_user_admin_id());
