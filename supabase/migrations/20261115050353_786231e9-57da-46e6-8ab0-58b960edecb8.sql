CREATE OR REPLACE FUNCTION public.can_read_purchase_history(p_admin_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
 SELECT auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND p_admin_id=public.get_user_admin_id() AND (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.id=p_admin_id AND p.role='admin')
 OR NOT EXISTS(SELECT 1 FROM private.report_pins rp WHERE rp.admin_id=p_admin_id)
 OR EXISTS(SELECT 1 FROM private.report_pin_unlocks u WHERE u.user_id=auth.uid() AND u.expires_at>now() AND u.scope_key='all' AND EXISTS(SELECT 1 FROM private.report_pins rp WHERE rp.admin_id=p_admin_id AND rp.scope_key='all')));
$$;
REVOKE ALL ON FUNCTION public.can_read_purchase_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_purchase_history(uuid) TO authenticated,service_role;
CREATE POLICY purchase_history_pin_guard ON public.purchases AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_purchase_history(admin_id));
CREATE POLICY purchase_items_history_pin_guard ON public.purchase_items AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_purchase_history(admin_id) AND EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=purchase_id AND p.admin_id=purchase_items.admin_id));
CREATE POLICY purchase_distributions_history_pin_guard ON public.purchase_distributions AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_purchase_history(admin_id) AND EXISTS(SELECT 1 FROM public.purchase_items i WHERE i.id=purchase_item_id AND i.admin_id=purchase_distributions.admin_id));
CREATE POLICY purchase_payments_history_pin_guard ON public.purchase_payments AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_purchase_history(admin_id) AND EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=purchase_id AND p.admin_id=purchase_payments.admin_id));