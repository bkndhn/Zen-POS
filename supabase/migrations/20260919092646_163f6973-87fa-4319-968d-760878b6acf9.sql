DROP POLICY IF EXISTS "Users can view own linked providers" ON public.auth_providers;
DROP POLICY IF EXISTS "Users can manage own linked providers" ON public.auth_providers;
DROP POLICY IF EXISTS "Super admins can view all providers" ON public.auth_providers;

CREATE POLICY "Users can view own linked providers" ON public.auth_providers
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND profile_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own linked providers" ON public.auth_providers
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND profile_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (auth.uid() IS NOT NULL AND profile_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Super admins can view all providers" ON public.auth_providers
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "Staff can view service requests" ON public.table_service_requests;
DROP POLICY IF EXISTS "Staff can update service requests" ON public.table_service_requests;
DROP POLICY IF EXISTS "Staff can delete service requests" ON public.table_service_requests;

CREATE POLICY "Staff can view service requests" ON public.table_service_requests
  FOR SELECT TO authenticated USING (is_super_admin() OR admin_id = get_user_admin_id());
CREATE POLICY "Staff can update service requests" ON public.table_service_requests
  FOR UPDATE TO authenticated USING (is_super_admin() OR admin_id = get_user_admin_id())
  WITH CHECK (is_super_admin() OR admin_id = get_user_admin_id());
CREATE POLICY "Staff can delete service requests" ON public.table_service_requests
  FOR DELETE TO authenticated USING (is_super_admin() OR admin_id = get_user_admin_id());