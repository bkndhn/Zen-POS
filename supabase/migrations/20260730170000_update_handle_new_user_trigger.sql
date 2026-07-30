-- Migration: Update handle_new_user trigger to save all user metadata and default status to active

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
  v_hotel_name text;
  v_shop_name text;
  v_mobile text;
  v_address text;
  v_admin_id uuid;
  v_business_type text;
  v_name text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'User');
  v_hotel_name := NEW.raw_user_meta_data->>'hotel_name';
  v_shop_name := NEW.raw_user_meta_data->>'shop_name';
  v_mobile := NEW.raw_user_meta_data->>'mobile_number';
  v_address := NEW.raw_user_meta_data->>'address';
  v_business_type := COALESCE(NEW.raw_user_meta_data->>'business_type', 'restaurant');
  
  IF (NEW.raw_user_meta_data->>'admin_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'admin_id') != '' THEN
    BEGIN
      v_admin_id := (NEW.raw_user_meta_data->>'admin_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_admin_id := NULL;
    END;
  ELSE
    v_admin_id := NULL;
  END IF;

  -- Insert or update profile with all metadata
  INSERT INTO public.profiles (
    user_id,
    name,
    role,
    status,
    hotel_name,
    shop_name,
    mobile_number,
    address,
    admin_id
  )
  VALUES (
    NEW.id,
    v_name,
    v_role::app_role,
    'active'::text,
    v_hotel_name,
    v_shop_name,
    v_mobile,
    v_address,
    v_admin_id
  )
  ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = 'active',
    hotel_name = COALESCE(EXCLUDED.hotel_name, public.profiles.hotel_name),
    shop_name = COALESCE(EXCLUDED.shop_name, public.profiles.shop_name),
    mobile_number = COALESCE(EXCLUDED.mobile_number, public.profiles.mobile_number),
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    admin_id = COALESCE(EXCLUDED.admin_id, public.profiles.admin_id),
    updated_at = NOW();

  -- Insert shop settings for admin users
  IF v_role = 'admin' THEN
    INSERT INTO public.shop_settings (user_id, business_type)
    VALUES (NEW.id, v_business_type)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET
      business_type = EXCLUDED.business_type;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;
