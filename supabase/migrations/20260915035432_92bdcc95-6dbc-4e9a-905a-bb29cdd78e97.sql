-- 1) push_queue: restrict the permissive policy to the service role only
DROP POLICY IF EXISTS "Service role full access on push_queue" ON public.push_queue;

CREATE POLICY "Service role full access on push_queue"
ON public.push_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON public.push_queue FROM anon, authenticated;
GRANT ALL ON public.push_queue TO service_role;

-- 2) shifts: replace self-referencing profile checks with canonical tenant helpers
DROP POLICY IF EXISTS "Enable read for users based on admin_id" ON public.shifts;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.shifts;
DROP POLICY IF EXISTS "Enable update for users based on admin_id" ON public.shifts;
DROP POLICY IF EXISTS "Enable delete for admin users only" ON public.shifts;

CREATE POLICY "Tenant members can view their shifts"
ON public.shifts
FOR SELECT
TO authenticated
USING (admin_id = public.get_my_admin_id() OR public.is_super_admin());

CREATE POLICY "Tenant members can open shifts"
ON public.shifts
FOR INSERT
TO authenticated
WITH CHECK (admin_id = public.get_my_admin_id());

CREATE POLICY "Tenant members can update their shifts"
ON public.shifts
FOR UPDATE
TO authenticated
USING (admin_id = public.get_my_admin_id() OR public.is_super_admin())
WITH CHECK (admin_id = public.get_my_admin_id() OR public.is_super_admin());

CREATE POLICY "Only admins can delete shifts"
ON public.shifts
FOR DELETE
TO authenticated
USING (public.is_admin_or_super() AND (admin_id = public.get_my_admin_id() OR public.is_super_admin()));
