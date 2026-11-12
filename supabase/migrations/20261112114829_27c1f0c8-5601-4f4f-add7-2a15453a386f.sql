REVOKE EXECUTE ON FUNCTION public.check_auth_rate_limit(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.check_admin_storage_allowance(p_admin_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'db_quota_mb', q.db_quota_mb, 'file_quota_mb', q.file_quota_mb,
    'cleanup_permission', COALESCE(q.cleanup_permission, false),
    'db_bytes', COALESCE(u.db_bytes, 0), 'file_bytes', COALESCE(u.file_bytes, 0),
    'db_blocked', (q.db_quota_mb IS NOT NULL AND COALESCE(u.db_bytes,0) >= q.db_quota_mb * 1048576),
    'file_blocked', (q.file_quota_mb IS NOT NULL AND COALESCE(u.file_bytes,0) >= q.file_quota_mb * 1048576)
  )
  FROM (SELECT p_admin_id AS admin_id) base
  LEFT JOIN public.admin_storage_quotas q ON q.admin_id = base.admin_id
  LEFT JOIN public.admin_storage_usage u ON u.admin_id = base.admin_id
  WHERE auth.uid() IS NULL
     OR public.get_my_admin_id() = p_admin_id
     OR public.is_super_admin();
$function$;

CREATE OR REPLACE FUNCTION public.get_branch_scoped_shop_settings(p_user_id uuid, p_branch_id uuid)
 RETURNS SETOF shop_settings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_admin uuid; v_main uuid; v_found public.shop_settings;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
       p_user_id = auth.uid()
       OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id
                  AND (p.id = public.get_my_admin_id() OR p.admin_id = public.get_my_admin_id()))
     ) THEN
    RETURN;
  END IF;
  SELECT * INTO v_found FROM public.shop_settings WHERE user_id = p_user_id AND branch_id = p_branch_id LIMIT 1;
  IF FOUND THEN RETURN NEXT v_found; RETURN; END IF;
  SELECT CASE WHEN p.role = 'admin' THEN p.id ELSE p.admin_id END INTO v_admin FROM public.profiles p WHERE p.user_id = p_user_id LIMIT 1;
  IF v_admin IS NOT NULL THEN
    SELECT id INTO v_main FROM public.branches WHERE admin_id = v_admin AND is_main LIMIT 1;
    IF v_main IS NOT NULL THEN
      SELECT * INTO v_found FROM public.shop_settings WHERE user_id = p_user_id AND branch_id = v_main LIMIT 1;
      IF FOUND THEN RETURN NEXT v_found; RETURN; END IF;
    END IF;
  END IF;
  SELECT * INTO v_found FROM public.shop_settings WHERE user_id = p_user_id ORDER BY branch_id NULLS LAST LIMIT 1;
  IF FOUND THEN RETURN NEXT v_found; END IF;
END $function$;
REVOKE EXECUTE ON FUNCTION public.get_branch_scoped_shop_settings(uuid,uuid) FROM PUBLIC, anon;

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) INTO d;
  d := replace(d, 'IF v_existing_profile_id IS NULL AND v_email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL THEN', 'IF false THEN');
  IF position('IF false THEN' in d) = 0 THEN RAISE EXCEPTION 'handle_new_user patch failed'; END IF;
  EXECUTE d;
END $$;