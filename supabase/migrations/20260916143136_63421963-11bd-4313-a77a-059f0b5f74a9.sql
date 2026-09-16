
-- 1. admin_create_user: caller authorization
CREATE OR REPLACE FUNCTION public.admin_create_user(p_email text, p_password text, p_name text, p_role text DEFAULT 'user'::text, p_hotel_name text DEFAULT NULL::text, p_shop_name text DEFAULT NULL::text, p_mobile_number text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid, p_business_type text DEFAULT 'restaurant'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_meta jsonb;
  v_existing_id uuid;
  v_caller_role text;
  v_caller_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role::text, id INTO v_caller_role, v_caller_profile_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_caller_role = 'super_admin' THEN
    NULL; -- platform owner may create any account
  ELSIF v_caller_role = 'admin' THEN
    IF p_role <> 'user' THEN
      RAISE EXCEPTION 'Not authorized to create % accounts', p_role;
    END IF;
    IF p_admin_id IS NULL OR p_admin_id <> v_caller_profile_id THEN
      RAISE EXCEPTION 'Not authorized to create users for another business';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_existing_id FROM auth.users WHERE email = LOWER(p_email) LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'An account with email % already exists.', p_email;
  END IF;

  v_user_id := gen_random_uuid();
  v_meta := jsonb_build_object(
    'name', p_name,
    'role', p_role,
    'hotel_name', p_hotel_name,
    'shop_name', p_shop_name,
    'mobile_number', p_mobile_number,
    'address', p_address,
    'admin_id', p_admin_id,
    'business_type', p_business_type
  );

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', LOWER(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(), '{"provider": "email", "providers": ["email"]}'::jsonb, v_meta, NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.profiles (
    id, user_id, email, name, role, status, hotel_name, shop_name, mobile_number, address, admin_id, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id, LOWER(p_email), p_name, p_role::app_role, 'active', p_hotel_name, p_shop_name, p_mobile_number, p_address, p_admin_id, NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, status = 'active', hotel_name = COALESCE(EXCLUDED.hotel_name, public.profiles.hotel_name), shop_name = COALESCE(EXCLUDED.shop_name, public.profiles.shop_name), mobile_number = COALESCE(EXCLUDED.mobile_number, public.profiles.mobile_number), address = COALESCE(EXCLUDED.address, public.profiles.address), admin_id = COALESCE(EXCLUDED.admin_id, public.profiles.admin_id), updated_at = NOW();

  IF p_role = 'admin' THEN
    INSERT INTO public.shop_settings (user_id, shop_name, address)
    VALUES (v_user_id, COALESCE(p_shop_name, p_hotel_name), p_address)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET
      shop_name = COALESCE(EXCLUDED.shop_name, public.shop_settings.shop_name), address = COALESCE(EXCLUDED.address, public.shop_settings.address);
  END IF;

  RETURN jsonb_build_object('id', v_user_id, 'email', LOWER(p_email), 'success', true);
END;
$function$;

-- 2. admin_delete_sub_user: only owning admin or super admin
CREATE OR REPLACE FUNCTION public.admin_delete_sub_user(p_target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_auth_user_id UUID;
  v_target_admin_id UUID;
  v_target_role text;
  v_caller_role text;
  v_caller_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role::text, id INTO v_caller_role, v_caller_profile_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id, admin_id, role::text
    INTO v_auth_user_id, v_target_admin_id, v_target_role
  FROM public.profiles
  WHERE id = p_target_user_id OR user_id = p_target_user_id
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_caller_role <> 'super_admin' THEN
    IF v_caller_role <> 'admin'
       OR v_target_role <> 'user'
       OR v_target_admin_id IS NULL
       OR v_target_admin_id <> v_caller_profile_id THEN
      RAISE EXCEPTION 'Not authorized to delete this user';
    END IF;
  END IF;

  DELETE FROM public.user_branch_assignments WHERE user_id = p_target_user_id OR user_id = v_auth_user_id;
  DELETE FROM public.profiles WHERE id = p_target_user_id OR user_id = v_auth_user_id;
  DELETE FROM auth.users WHERE id = v_auth_user_id;
END;
$function$;

-- 3. super_admin_delete_client: super admins only
CREATE OR REPLACE FUNCTION public.super_admin_delete_client(p_target_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_admin_auth_id UUID;
  v_sub_user RECORD;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id INTO v_admin_auth_id
  FROM public.profiles
  WHERE id = p_target_admin_id OR user_id = p_target_admin_id
  LIMIT 1;

  IF v_admin_auth_id IS NULL THEN
    v_admin_auth_id := p_target_admin_id;
  END IF;

  FOR v_sub_user IN (SELECT id, user_id FROM public.profiles WHERE admin_id = p_target_admin_id OR admin_id = (SELECT id FROM public.profiles WHERE user_id = v_admin_auth_id)) LOOP
    DELETE FROM public.user_branch_assignments WHERE user_id = v_sub_user.id OR user_id = v_sub_user.user_id;
    DELETE FROM public.profiles WHERE id = v_sub_user.id;
    DELETE FROM auth.users WHERE id = v_sub_user.user_id;
  END LOOP;

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

  DELETE FROM public.profiles WHERE id = p_target_admin_id OR user_id = v_admin_auth_id;
  DELETE FROM auth.users WHERE id = v_admin_auth_id;
END;
$function$;

-- 4. app-releases: restrict downloads to admins / super admins
DROP POLICY IF EXISTS "Authenticated users can download app releases" ON storage.objects;
CREATE POLICY "Admins can download app releases"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'app-releases'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin'::app_role, 'super_admin'::app_role)
  )
);

-- 5. item_batches: canonical tenant scoping
DROP POLICY IF EXISTS "Users can view their own item batches" ON public.item_batches;
DROP POLICY IF EXISTS "Users can insert their own item batches" ON public.item_batches;
DROP POLICY IF EXISTS "Users can update their own item batches" ON public.item_batches;
DROP POLICY IF EXISTS "Users can delete their own item batches" ON public.item_batches;
DROP POLICY IF EXISTS "Enable all for admin" ON public.item_batches;

CREATE POLICY "Tenant can view item batches"
ON public.item_batches FOR SELECT TO authenticated
USING (public.is_super_admin() OR (admin_id IS NOT NULL AND admin_id = public.get_user_admin_id()));

CREATE POLICY "Tenant can insert item batches"
ON public.item_batches FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin() OR (admin_id IS NOT NULL AND admin_id = public.get_user_admin_id()));

CREATE POLICY "Tenant can update item batches"
ON public.item_batches FOR UPDATE TO authenticated
USING (public.is_super_admin() OR (admin_id IS NOT NULL AND admin_id = public.get_user_admin_id()))
WITH CHECK (public.is_super_admin() OR (admin_id IS NOT NULL AND admin_id = public.get_user_admin_id()));

CREATE POLICY "Tenant can delete item batches"
ON public.item_batches FOR DELETE TO authenticated
USING (public.is_super_admin() OR (admin_id IS NOT NULL AND admin_id = public.get_user_admin_id()));

-- 6. table_orders: branch-scoped reads
DROP POLICY IF EXISTS "Authenticated users view own shop orders" ON public.table_orders;
CREATE POLICY "Staff view table orders in their branch"
ON public.table_orders FOR SELECT TO authenticated
USING (public.has_branch_read_access(admin_id, branch_id));
