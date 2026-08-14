-- 1) Backfill legacy bills with NULL admin_id from their creator's tenant
UPDATE public.bills b
SET admin_id = COALESCE(p.admin_id, p.id)
FROM public.profiles p
WHERE b.admin_id IS NULL
  AND b.created_by = p.user_id;

-- 2) Deny access when the row has no owner (NULL admin_id) instead of falling through to TRUE
CREATE OR REPLACE FUNCTION public.has_branch_read_access(target_admin_id uuid, target_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_my_admin_id uuid;
BEGIN
  SELECT role, CASE WHEN role = 'admin' THEN id ELSE admin_id END
    INTO v_role, v_my_admin_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF v_role IS NULL THEN RETURN FALSE; END IF;

  -- Explicit deny: unowned rows or users without a tenant must never be accessible
  IF target_admin_id IS NULL OR v_my_admin_id IS NULL THEN RETURN FALSE; END IF;
  IF target_admin_id <> v_my_admin_id THEN RETURN FALSE; END IF;

  IF target_branch_id IS NULL THEN RETURN TRUE; END IF;
  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  IF v_role = 'user' THEN
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_branch_write_access(target_admin_id uuid, target_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_my_admin_id uuid;
BEGIN
  SELECT role, CASE WHEN role = 'admin' THEN id ELSE admin_id END
    INTO v_role, v_my_admin_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF v_role IS NULL THEN RETURN FALSE; END IF;

  IF target_admin_id IS NULL OR v_my_admin_id IS NULL THEN RETURN FALSE; END IF;
  IF target_admin_id <> v_my_admin_id THEN RETURN FALSE; END IF;

  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  IF v_role = 'user' THEN
    IF target_branch_id IS NULL THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$function$;

-- 3) Prevent self-signup privilege escalation: client-side profile inserts limited to the base role
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'user'::app_role
  AND admin_id IS NULL
);