CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role::text FROM public.profiles WHERE user_id = auth.uid()) = 'super_admin',
    false
  ) AND auth.uid() IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role::text FROM public.profiles WHERE user_id = auth.uid()) IN ('admin', 'super_admin'),
    false
  ) AND auth.uid() IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.get_all_users_for_super_admin()
 RETURNS TABLE(profile_id uuid, user_id uuid, email text, name text, role text, hotel_name text, shop_name text, mobile_number text, address text, status text, admin_id uuid, admin_name text, last_login timestamp with time zone, login_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    p.id              AS profile_id,
    p.user_id         AS user_id,
    u.email::text     AS email,
    p.name            AS name,
    p.role::text      AS role,
    p.hotel_name      AS hotel_name,
    p.shop_name       AS shop_name,
    p.mobile_number   AS mobile_number,
    p.address         AS address,
    COALESCE(p.status,'active') AS status,
    p.admin_id        AS admin_id,
    (SELECT ap.name FROM public.profiles ap WHERE ap.id = p.admin_id) AS admin_name,
    p.last_login      AS last_login,
    COALESCE(p.login_count,0) AS login_count,
    p.created_at      AS created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.role, p.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_all_users_for_super_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_super_admin() TO service_role;