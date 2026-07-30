-- User Lifecycle, Account Deletion & Force Logout RPC Migration

-- 1. Function for Client Admin to delete a sub-user account (Profile + Auth User)
CREATE OR REPLACE FUNCTION public.admin_delete_sub_user(p_target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Resolve auth.users ID
  SELECT user_id INTO v_auth_user_id
  FROM public.profiles
  WHERE id = p_target_user_id OR user_id = p_target_user_id
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := p_target_user_id;
  END IF;

  -- Delete from user_branch_assignments
  DELETE FROM public.user_branch_assignments WHERE user_id = p_target_user_id OR user_id = v_auth_user_id;

  -- Delete from profiles
  DELETE FROM public.profiles WHERE id = p_target_user_id OR user_id = v_auth_user_id;

  -- Delete from auth.users (hard delete authentication account)
  DELETE FROM auth.users WHERE id = v_auth_user_id;
END;
$$;

-- 2. Function for Super Admin to delete a Client Admin and ALL of their data + sub-users
CREATE OR REPLACE FUNCTION public.super_admin_delete_client(p_target_admin_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_auth_id UUID;
  v_sub_user RECORD;
BEGIN
  -- Resolve Admin's auth.users ID
  SELECT user_id INTO v_admin_auth_id
  FROM public.profiles
  WHERE id = p_target_admin_id OR user_id = p_target_admin_id
  LIMIT 1;

  IF v_admin_auth_id IS NULL THEN
    v_admin_auth_id := p_target_admin_id;
  END IF;

  -- Delete all sub-users belonging to this admin
  FOR v_sub_user IN (SELECT id, user_id FROM public.profiles WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id)) LOOP
    DELETE FROM public.user_branch_assignments WHERE user_id = v_sub_user.id OR user_id = v_sub_user.user_id;
    DELETE FROM public.profiles WHERE id = v_sub_user.id;
    DELETE FROM auth.users WHERE id = v_sub_user.user_id;
  END LOOP;

  -- Delete client operational & financial data
  DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id));
  DELETE FROM public.bills WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.expenses WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.purchases WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.items WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.categories WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.customers WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.customer_ledger WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.tables WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.branches WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id);
  DELETE FROM public.shop_settings WHERE user_id = v_admin_auth_id OR user_id = (SELECT user_id FROM public.profiles WHERE id = p_target_admin_id);

  -- Delete Client Admin profile
  DELETE FROM public.profiles WHERE id = p_target_admin_id OR user_id = v_admin_auth_id;

  -- Delete Client Admin auth account
  DELETE FROM auth.users WHERE id = v_admin_auth_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.admin_delete_sub_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_client(UUID) TO authenticated, service_role;

-- Ensure profiles publication for Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
