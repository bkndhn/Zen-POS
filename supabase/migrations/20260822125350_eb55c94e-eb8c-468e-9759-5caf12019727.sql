CREATE OR REPLACE FUNCTION public.get_my_admin_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'super_admin')
    THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
    THEN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    ELSE (SELECT admin_id FROM public.profiles WHERE user_id = auth.uid())
  END
$function$;

DROP POLICY IF EXISTS "Admin can update table orders" ON public.table_orders;
CREATE POLICY "Staff can update table orders in their branch"
ON public.table_orders
FOR UPDATE
TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id))
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));