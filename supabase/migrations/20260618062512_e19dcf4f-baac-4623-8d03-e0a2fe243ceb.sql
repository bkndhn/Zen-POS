
-- Fix table_orders SELECT policy: remove flawed auth.uid() = admin_id branch
DROP POLICY IF EXISTS "Authenticated users view own shop orders" ON public.table_orders;
CREATE POLICY "Authenticated users view own shop orders"
ON public.table_orders FOR SELECT
TO authenticated
USING (admin_id = public.get_user_admin_id());

-- Tighten tax_rates write policies: only admins (and super admins) can write,
-- and only on rows belonging to their own admin scope.
DROP POLICY IF EXISTS "Admins can manage their tax rates" ON public.tax_rates;
DROP POLICY IF EXISTS "Admins can insert tax rates" ON public.tax_rates;
DROP POLICY IF EXISTS "Admins can update own tax rates" ON public.tax_rates;
DROP POLICY IF EXISTS "Admins can delete own tax rates" ON public.tax_rates;
DROP POLICY IF EXISTS "Users can view own admin tax rates" ON public.tax_rates;
DROP POLICY IF EXISTS "Users can view their admin's tax rates" ON public.tax_rates;

CREATE POLICY "View tax rates in own admin scope"
ON public.tax_rates FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
);

CREATE POLICY "Admins insert tax rates in own scope"
ON public.tax_rates FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (public.get_my_role() = 'admin' AND admin_id = public.get_my_profile_id())
);

CREATE POLICY "Admins update tax rates in own scope"
ON public.tax_rates FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR (public.get_my_role() = 'admin' AND admin_id = public.get_my_profile_id())
)
WITH CHECK (
  public.is_super_admin()
  OR (public.get_my_role() = 'admin' AND admin_id = public.get_my_profile_id())
);

CREATE POLICY "Admins delete tax rates in own scope"
ON public.tax_rates FOR DELETE
TO authenticated
USING (
  public.is_super_admin()
  OR (public.get_my_role() = 'admin' AND admin_id = public.get_my_profile_id())
);
