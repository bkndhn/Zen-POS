CREATE OR REPLACE FUNCTION private.can_read_purchase_history(p_admin_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
 SELECT auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND p_admin_id=public.get_user_admin_id() AND (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.id=p_admin_id AND p.role='admin')
 OR NOT EXISTS(SELECT 1 FROM private.report_pins rp WHERE rp.admin_id=p_admin_id)
 OR NOT EXISTS(SELECT 1 FROM private.report_pins rp WHERE rp.admin_id=p_admin_id AND NOT EXISTS(SELECT 1 FROM private.report_pin_unlocks u WHERE u.user_id=auth.uid() AND u.expires_at>now() AND u.scope_key=rp.scope_key)));
$$;
REVOKE ALL ON FUNCTION private.can_read_purchase_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_purchase_history(uuid) TO authenticated,service_role;