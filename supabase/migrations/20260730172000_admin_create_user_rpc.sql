-- Migration: Create admin_create_user RPC function to bypass email rate limits when Super Admin or Client Admin creates users

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_name text,
  p_role text DEFAULT 'user',
  p_hotel_name text DEFAULT NULL,
  p_shop_name text DEFAULT NULL,
  p_mobile_number text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL,
  p_business_type text DEFAULT 'restaurant'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_meta jsonb;
  v_existing_id uuid;
BEGIN
  -- Check if user with email already exists
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

  -- Insert into auth.users with pre-confirmed email to bypass email rate limits
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    LOWER(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    v_meta,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  -- Insert into public.profiles
  INSERT INTO public.profiles (
    id,
    user_id,
    email,
    name,
    role,
    status,
    hotel_name,
    shop_name,
    mobile_number,
    address,
    admin_id,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    LOWER(p_email),
    p_name,
    p_role::app_role,
    'active',
    p_hotel_name,
    p_shop_name,
    p_mobile_number,
    p_address,
    p_admin_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = 'active',
    hotel_name = COALESCE(EXCLUDED.hotel_name, public.profiles.hotel_name),
    shop_name = COALESCE(EXCLUDED.shop_name, public.profiles.shop_name),
    mobile_number = COALESCE(EXCLUDED.mobile_number, public.profiles.mobile_number),
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    admin_id = COALESCE(EXCLUDED.admin_id, public.profiles.admin_id),
    updated_at = NOW();

  -- Insert into shop_settings for admin
  IF p_role = 'admin' THEN
    INSERT INTO public.shop_settings (user_id, business_type)
    VALUES (v_user_id, p_business_type)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET
      business_type = EXCLUDED.business_type;
  END IF;

  RETURN jsonb_build_object('id', v_user_id, 'email', LOWER(p_email), 'success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text, text, uuid, text) TO authenticated, service_role;
