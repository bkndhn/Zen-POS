CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_provider TEXT; v_role TEXT; v_hotel_name TEXT; v_shop_name TEXT; v_mobile TEXT; v_address TEXT;
  v_admin_id UUID; v_name TEXT; v_email TEXT; v_phone TEXT; v_provider_uid TEXT;
  v_existing_profile_id UUID; v_profile_id UUID; v_avatar_url TEXT;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');
  v_phone := NEW.phone;
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  CASE v_provider
    WHEN 'email' THEN v_provider_uid := v_email;
    WHEN 'phone' THEN v_provider_uid := COALESCE(v_phone, v_email);
    WHEN 'google' THEN v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email);
    WHEN 'apple' THEN v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email);
    ELSE v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email, NEW.id::text);
  END CASE;

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  -- Never allow self-assigned super admin
  IF v_role NOT IN ('admin','user') THEN v_role := 'user'; END IF;
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'user_name', split_part(COALESCE(v_email, ''), '@', 1), 'User');
  v_hotel_name := NEW.raw_user_meta_data->>'hotel_name';
  v_shop_name := NEW.raw_user_meta_data->>'shop_name';
  v_mobile := COALESCE(NEW.raw_user_meta_data->>'mobile_number', v_phone);
  v_address := NEW.raw_user_meta_data->>'address';
  IF COALESCE(NEW.raw_user_meta_data->>'admin_id','') <> '' THEN
    BEGIN v_admin_id := (NEW.raw_user_meta_data->>'admin_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_admin_id := NULL; END;
  END IF;

  SELECT profile_id INTO v_existing_profile_id FROM auth_providers
  WHERE provider = v_provider AND provider_uid = v_provider_uid;
  IF v_existing_profile_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_profile_id FROM profiles WHERE email = v_email LIMIT 1;
  END IF;

  IF v_existing_profile_id IS NOT NULL THEN
    UPDATE profiles SET user_id = NEW.id,
      name = COALESCE(NULLIF(v_name, ''), profiles.name),
      mobile_number = COALESCE(v_mobile, profiles.mobile_number), updated_at = NOW()
    WHERE id = v_existing_profile_id;
    v_profile_id := v_existing_profile_id;
  ELSE
    -- New accounts start PAUSED until a Super Admin (or the owning client admin) activates them.
    INSERT INTO public.profiles (user_id, email, name, role, status, hotel_name, shop_name, mobile_number, address, admin_id)
    VALUES (NEW.id, v_email, v_name, v_role::app_role, 'paused', v_hotel_name, v_shop_name, v_mobile, v_address, v_admin_id)
    ON CONFLICT (user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, profiles.email),
      name = COALESCE(NULLIF(EXCLUDED.name, ''), profiles.name),
      hotel_name = COALESCE(EXCLUDED.hotel_name, profiles.hotel_name),
      shop_name = COALESCE(EXCLUDED.shop_name, profiles.shop_name),
      mobile_number = COALESCE(EXCLUDED.mobile_number, profiles.mobile_number),
      address = COALESCE(EXCLUDED.address, profiles.address),
      admin_id = COALESCE(EXCLUDED.admin_id, profiles.admin_id),
      updated_at = NOW()
    RETURNING id INTO v_profile_id;
  END IF;

  IF v_profile_id IS NOT NULL AND v_provider_uid IS NOT NULL THEN
    INSERT INTO auth_providers (profile_id, provider, provider_uid, last_used_at, metadata)
    VALUES (v_profile_id, v_provider, v_provider_uid, NOW(), jsonb_build_object('avatar_url', v_avatar_url, 'name', v_name))
    ON CONFLICT (provider, provider_uid) DO UPDATE SET last_used_at = NOW(),
      metadata = jsonb_build_object('avatar_url', v_avatar_url, 'name', v_name);
  END IF;

  IF v_role = 'admin' THEN
    INSERT INTO public.shop_settings (user_id, shop_name, address)
    VALUES (NEW.id, COALESCE(v_shop_name, v_hotel_name), v_address)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET
      shop_name = COALESCE(EXCLUDED.shop_name, shop_settings.shop_name),
      address = COALESCE(EXCLUDED.address, shop_settings.address);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$function$;

UPDATE public.app_settings SET signup_enabled = false WHERE id = true;