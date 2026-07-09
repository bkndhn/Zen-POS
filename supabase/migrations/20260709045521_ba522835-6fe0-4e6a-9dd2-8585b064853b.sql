
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS shop_name text,
  ADD COLUMN IF NOT EXISTS address text;

-- Validate mobile number format (allow NULL; require 10 digits starting 6-9 when present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mobile_number_format_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_mobile_number_format_chk
      CHECK (mobile_number IS NULL OR mobile_number ~ '^[6-9][0-9]{9}$');
  END IF;
END $$;

-- Recreate super admin listing RPC to include new fields
DROP FUNCTION IF EXISTS public.get_all_users_for_super_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_for_super_admin()
RETURNS TABLE(
  profile_id uuid,
  user_id uuid,
  email text,
  name text,
  role text,
  hotel_name text,
  shop_name text,
  mobile_number text,
  address text,
  status text,
  admin_id uuid,
  admin_name text,
  last_login timestamp with time zone,
  login_count integer,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
