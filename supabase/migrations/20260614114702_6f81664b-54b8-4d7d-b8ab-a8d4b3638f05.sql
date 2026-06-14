CREATE OR REPLACE FUNCTION public.get_all_users_for_super_admin()
RETURNS TABLE(
  profile_id uuid,
  user_id uuid,
  email text,
  name text,
  role text,
  hotel_name text,
  status text,
  admin_id uuid,
  admin_name text,
  last_login timestamptz,
  login_count int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT
    p.id              AS profile_id,
    p.user_id         AS user_id,
    u.email::text     AS email,
    p.name            AS name,
    p.role::text      AS role,
    p.hotel_name      AS hotel_name,
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
$$;