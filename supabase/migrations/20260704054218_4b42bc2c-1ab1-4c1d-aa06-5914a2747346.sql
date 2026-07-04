
-- 1) items: remove overly broad anon SELECT policy (anon has no table grant anyway; public menu uses SECURITY DEFINER RPCs / authenticated access)
DROP POLICY IF EXISTS "Anon can view active items" ON public.items;

-- 2) profiles: prevent privilege escalation via self insert/update
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role <> 'super_admin'::app_role
    AND admin_id IS NULL
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
    AND admin_id IS NOT DISTINCT FROM (SELECT p.admin_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- 3) tax_rates: fix broken self-referential scope check to use the row's admin_id
DROP POLICY IF EXISTS "tax_rates_modify" ON public.tax_rates;
CREATE POLICY "tax_rates_modify"
  ON public.tax_rates
  FOR ALL
  USING (public.has_branch_write_access(admin_id, branch_id))
  WITH CHECK (public.has_branch_write_access(admin_id, branch_id));

DROP POLICY IF EXISTS "tax_rates_select" ON public.tax_rates;
CREATE POLICY "tax_rates_select"
  ON public.tax_rates
  FOR SELECT
  USING (public.has_branch_read_access(admin_id, branch_id));
