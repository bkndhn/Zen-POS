-- user_permissions: remove untenanted admin-wide policies
DROP POLICY IF EXISTS "user_permissions_select" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_modify" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins manage own sub-user permissions (select)" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins manage own sub-user permissions (insert)" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins manage own sub-user permissions (update)" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins manage own sub-user permissions (delete)" ON public.user_permissions;

CREATE POLICY "user_permissions_select" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.user_id = user_permissions.user_id
        AND target.admin_id = get_my_profile_id()
    )
  );

CREATE POLICY "user_permissions_insert" ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.user_id = user_permissions.user_id
        AND target.admin_id = get_my_profile_id()
    )
  );

CREATE POLICY "user_permissions_update" ON public.user_permissions
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.user_id = user_permissions.user_id
        AND target.admin_id = get_my_profile_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.user_id = user_permissions.user_id
        AND target.admin_id = get_my_profile_id()
    )
  );

CREATE POLICY "user_permissions_delete" ON public.user_permissions
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles target
      WHERE target.user_id = user_permissions.user_id
        AND target.admin_id = get_my_profile_id()
    )
  );

-- user_branches: tenant-scope admin management
DROP POLICY IF EXISTS "Admins manage branch assignments" ON public.user_branches;
DROP POLICY IF EXISTS "Users view own branch assignments" ON public.user_branches;

CREATE POLICY "Users view own branch assignments" ON public.user_branches
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins manage branch assignments" ON public.user_branches
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles target
        WHERE target.user_id = user_branches.user_id
          AND (target.admin_id = get_my_profile_id() OR target.id = get_my_profile_id())
      )
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = user_branches.branch_id
          AND b.admin_id = get_my_profile_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles target
        WHERE target.user_id = user_branches.user_id
          AND (target.admin_id = get_my_profile_id() OR target.id = get_my_profile_id())
      )
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = user_branches.branch_id
          AND b.admin_id = get_my_profile_id()
      )
    )
  );

REVOKE ALL ON public.user_branches FROM anon;
REVOKE ALL ON public.user_permissions FROM anon;