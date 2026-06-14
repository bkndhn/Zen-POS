
-- 1) Items: restrict anon to safe menu columns only
REVOKE SELECT ON public.items FROM anon;
GRANT SELECT (
  id, name, price, description, image_url, video_url, media_type,
  category, unit, is_tax_inclusive, tax_rate_id, hsn_code,
  display_order, quantity_step, base_value, is_active, branch_id, admin_id
) ON public.items TO anon;

-- 2) user_permissions: scope admins to their own sub-users
DROP POLICY IF EXISTS "Admins and Super Admins can view all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins and Super Admins can insert permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins and Super Admins can update permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins and Super Admins can delete permissions" ON public.user_permissions;

CREATE POLICY "Admins manage own sub-user permissions (select)"
ON public.user_permissions FOR SELECT
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.user_id = user_permissions.user_id
      AND target.admin_id = public.get_my_profile_id()
  )
);

CREATE POLICY "Admins manage own sub-user permissions (insert)"
ON public.user_permissions FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.user_id = user_permissions.user_id
      AND target.admin_id = public.get_my_profile_id()
  )
);

CREATE POLICY "Admins manage own sub-user permissions (update)"
ON public.user_permissions FOR UPDATE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.user_id = user_permissions.user_id
      AND target.admin_id = public.get_my_profile_id()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.user_id = user_permissions.user_id
      AND target.admin_id = public.get_my_profile_id()
  )
);

CREATE POLICY "Admins manage own sub-user permissions (delete)"
ON public.user_permissions FOR DELETE
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles target
    WHERE target.user_id = user_permissions.user_id
      AND target.admin_id = public.get_my_profile_id()
  )
);
