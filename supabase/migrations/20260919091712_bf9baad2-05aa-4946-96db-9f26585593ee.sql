-- 1) Scope tenant table policies to authenticated role only
DROP POLICY IF EXISTS "Users can view ledgers" ON public.customer_ledger;
DROP POLICY IF EXISTS "Users can insert ledgers" ON public.customer_ledger;
DROP POLICY IF EXISTS "Users can update ledgers" ON public.customer_ledger;

CREATE POLICY "Users can view ledgers" ON public.customer_ledger
  FOR SELECT TO authenticated USING (admin_id = get_user_admin_id());
CREATE POLICY "Users can insert ledgers" ON public.customer_ledger
  FOR INSERT TO authenticated WITH CHECK (admin_id = get_user_admin_id());
CREATE POLICY "Users can update ledgers" ON public.customer_ledger
  FOR UPDATE TO authenticated USING (admin_id = get_user_admin_id())
  WITH CHECK (admin_id = get_user_admin_id());

REVOKE ALL ON public.customer_ledger FROM anon;

DROP POLICY IF EXISTS "Khata transactions SELECT" ON public.khata_transactions;
DROP POLICY IF EXISTS "Khata transactions INSERT" ON public.khata_transactions;
DROP POLICY IF EXISTS "Khata transactions UPDATE" ON public.khata_transactions;
DROP POLICY IF EXISTS "Khata transactions DELETE" ON public.khata_transactions;

CREATE POLICY "Khata transactions SELECT" ON public.khata_transactions
  FOR SELECT TO authenticated USING (has_branch_read_access(admin_id, branch_id));
CREATE POLICY "Khata transactions INSERT" ON public.khata_transactions
  FOR INSERT TO authenticated WITH CHECK (has_branch_write_access(admin_id, branch_id));
CREATE POLICY "Khata transactions UPDATE" ON public.khata_transactions
  FOR UPDATE TO authenticated USING (has_branch_write_access(admin_id, branch_id))
  WITH CHECK (has_branch_write_access(admin_id, branch_id));
CREATE POLICY "Khata transactions DELETE" ON public.khata_transactions
  FOR DELETE TO authenticated USING (has_branch_write_access(admin_id, branch_id));

REVOKE ALL ON public.khata_transactions FROM anon;

DROP POLICY IF EXISTS "Secure bill items access" ON public.bill_items;
DROP POLICY IF EXISTS "bill_items_insert_tenant_scoped" ON public.bill_items;

CREATE POLICY "Secure bill items access" ON public.bill_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_items.bill_id
      AND (is_super_admin() OR b.admin_id = get_user_admin_id() OR b.created_by = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_items.bill_id
      AND (is_super_admin() OR b.admin_id = get_user_admin_id() OR b.created_by = auth.uid())
  ));
CREATE POLICY "bill_items_insert_tenant_scoped" ON public.bill_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.admin_id = get_user_admin_id()
  ));

REVOKE ALL ON public.bill_items FROM anon;

-- 2) Scope profiles policies to authenticated role
DROP POLICY IF EXISTS "Admin update sub-users" ON public.profiles;
DROP POLICY IF EXISTS "Admin view sub-users" ON public.profiles;
DROP POLICY IF EXISTS "Child users view admin profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admin update any" ON public.profiles;
DROP POLICY IF EXISTS "Super admin view all" ON public.profiles;
DROP POLICY IF EXISTS "View own profile" ON public.profiles;

CREATE POLICY "Admin update sub-users" ON public.profiles
  FOR UPDATE TO authenticated USING (admin_id = get_my_profile_id())
  WITH CHECK (admin_id = get_my_profile_id() AND role = 'user'::app_role);
CREATE POLICY "Admin view sub-users" ON public.profiles
  FOR SELECT TO authenticated USING (admin_id = get_my_profile_id());
CREATE POLICY "Child users view admin profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = get_my_admin_id());
CREATE POLICY "Super admin update any" ON public.profiles
  FOR UPDATE TO authenticated USING (get_my_role() = 'super_admin' AND role = 'admin'::app_role);
CREATE POLICY "Super admin view all" ON public.profiles
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
CREATE POLICY "View own profile" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3) Hard block on privilege escalation via profile self-update
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing account role is not permitted';
  END IF;
  IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN
    RAISE EXCEPTION 'Changing account owner is not permitted';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing linked login is not permitted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Changing profile identity is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM anon, authenticated;