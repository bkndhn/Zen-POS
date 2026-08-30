-- ═══════════════════════════════════════════════════════════════
-- Multi-Provider Auth Foundation
-- Supports: email, Google OAuth, phone OTP, Apple, Microsoft, etc.
-- No UI changes — backend foundation only
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. AUTH_PROVIDERS TABLE ──────────────────────────────────
-- Application-level tracking of linked auth methods per profile
CREATE TABLE IF NOT EXISTS auth_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,        -- 'email', 'google', 'phone', 'apple', etc.
  provider_uid TEXT NOT NULL,    -- email address, phone number, or OAuth sub
  linked_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',   -- avatar_url, display_name from OAuth
  UNIQUE(provider, provider_uid) -- each provider identity maps to exactly one profile
);

CREATE INDEX IF NOT EXISTS idx_auth_providers_profile ON auth_providers(profile_id);
CREATE INDEX IF NOT EXISTS idx_auth_providers_lookup ON auth_providers(provider, provider_uid);

-- RLS
ALTER TABLE auth_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own linked providers"
  ON auth_providers FOR SELECT
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own linked providers"
  ON auth_providers FOR ALL
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all providers"
  ON auth_providers FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- ─── 2. SEED EXISTING USERS ──────────────────────────────────
INSERT INTO auth_providers (profile_id, provider, provider_uid, linked_at, last_used_at)
SELECT p.id, 'email', p.email, p.created_at, p.last_login
FROM profiles p
WHERE p.email IS NOT NULL
ON CONFLICT (provider, provider_uid) DO NOTHING;

-- ─── 3. LINK AUTH PROVIDER RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION link_auth_provider(
  p_provider TEXT,
  p_provider_uid TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_existing_profile UUID;
  v_result UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  -- Check if this provider identity is already linked to a DIFFERENT profile
  SELECT profile_id INTO v_existing_profile
  FROM auth_providers WHERE provider = p_provider AND provider_uid = p_provider_uid;

  IF v_existing_profile IS NOT NULL AND v_existing_profile != v_profile_id THEN
    RAISE EXCEPTION 'This % account is already linked to a different user', p_provider;
  END IF;

  INSERT INTO auth_providers (profile_id, provider, provider_uid, metadata, last_used_at)
  VALUES (v_profile_id, p_provider, p_provider_uid, p_metadata, now())
  ON CONFLICT (provider, provider_uid)
  DO UPDATE SET metadata = COALESCE(EXCLUDED.metadata, auth_providers.metadata), last_used_at = now()
  RETURNING id INTO v_result;

  RETURN jsonb_build_object('success', true, 'id', v_result, 'provider', p_provider);
END;
$$;

-- ─── 4. UNLINK AUTH PROVIDER RPC ──────────────────────────────
CREATE OR REPLACE FUNCTION unlink_auth_provider(p_provider TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_provider_count INT;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  SELECT count(*) INTO v_provider_count FROM auth_providers WHERE profile_id = v_profile_id;
  IF v_provider_count <= 1 THEN
    RAISE EXCEPTION 'Cannot unlink the last auth provider. You must have at least one login method.';
  END IF;

  DELETE FROM auth_providers WHERE profile_id = v_profile_id AND provider = p_provider;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider % is not linked to your account', p_provider;
  END IF;

  RETURN jsonb_build_object('success', true, 'unlinked', p_provider);
END;
$$;

-- ─── 5. GET MY LINKED PROVIDERS RPC ──────────────────────────
CREATE OR REPLACE FUNCTION get_my_auth_providers()
RETURNS TABLE (
  provider TEXT,
  provider_uid TEXT,
  linked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ap.provider, ap.provider_uid, ap.linked_at, ap.last_used_at, ap.metadata
  FROM auth_providers ap
  JOIN profiles p ON p.id = ap.profile_id
  WHERE p.user_id = auth.uid()
  ORDER BY ap.linked_at;
END;
$$;

-- ─── 6. RESOLVE PROFILE BY PROVIDER RPC ──────────────────────
CREATE OR REPLACE FUNCTION resolve_profile_by_provider(p_provider TEXT, p_provider_uid TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM auth_providers WHERE provider = p_provider AND provider_uid = p_provider_uid;
  RETURN v_profile_id;
END;
$$;

-- ─── 7. ENHANCED handle_new_user() — multi-provider aware ────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_role TEXT;
  v_hotel_name TEXT;
  v_shop_name TEXT;
  v_mobile TEXT;
  v_address TEXT;
  v_admin_id UUID;
  v_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_provider_uid TEXT;
  v_existing_profile_id UUID;
  v_profile_id UUID;
  v_avatar_url TEXT;
BEGIN
  -- Extract provider info
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');
  v_phone := NEW.phone;
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

  -- Determine provider_uid based on provider type
  CASE v_provider
    WHEN 'email' THEN v_provider_uid := v_email;
    WHEN 'phone' THEN v_provider_uid := COALESCE(v_phone, v_email);
    WHEN 'google' THEN v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email);
    WHEN 'apple' THEN v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email);
    ELSE v_provider_uid := COALESCE(NEW.raw_user_meta_data->>'sub', v_email, NEW.id::text);
  END CASE;

  -- Extract metadata (works for email, graceful fallback for OAuth)
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'user_name',
    split_part(COALESCE(v_email, ''), '@', 1),
    'User'
  );
  v_hotel_name := NEW.raw_user_meta_data->>'hotel_name';
  v_shop_name := NEW.raw_user_meta_data->>'shop_name';
  v_mobile := COALESCE(NEW.raw_user_meta_data->>'mobile_number', v_phone);
  v_address := NEW.raw_user_meta_data->>'address';

  IF (NEW.raw_user_meta_data->>'admin_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'admin_id') != '' THEN
    BEGIN
      v_admin_id := (NEW.raw_user_meta_data->>'admin_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_admin_id := NULL;
    END;
  ELSE
    v_admin_id := NULL;
  END IF;

  -- AUTO-LINK: Check if this provider identity already maps to an existing profile
  SELECT profile_id INTO v_existing_profile_id
  FROM auth_providers WHERE provider = v_provider AND provider_uid = v_provider_uid;

  -- If not found by provider, try matching by email (cross-provider auto-linking)
  IF v_existing_profile_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_profile_id FROM profiles WHERE email = v_email LIMIT 1;
  END IF;

  IF v_existing_profile_id IS NOT NULL THEN
    -- EXISTING USER: Link new auth identity to existing profile
    UPDATE profiles SET
      user_id = NEW.id,
      name = COALESCE(NULLIF(v_name, ''), profiles.name),
      mobile_number = COALESCE(v_mobile, profiles.mobile_number),
      updated_at = NOW()
    WHERE id = v_existing_profile_id;
    v_profile_id := v_existing_profile_id;
  ELSE
    -- NEW USER: Create profile (original behavior preserved)
    INSERT INTO public.profiles (
      user_id, email, name, role, status,
      hotel_name, shop_name, mobile_number, address, admin_id
    ) VALUES (
      NEW.id, v_email, v_name, v_role::app_role, 'active'::text,
      v_hotel_name, v_shop_name, v_mobile, v_address, v_admin_id
    )
    ON CONFLICT (user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, profiles.email),
      name = COALESCE(NULLIF(EXCLUDED.name, ''), profiles.name),
      role = EXCLUDED.role, status = 'active',
      hotel_name = COALESCE(EXCLUDED.hotel_name, profiles.hotel_name),
      shop_name = COALESCE(EXCLUDED.shop_name, profiles.shop_name),
      mobile_number = COALESCE(EXCLUDED.mobile_number, profiles.mobile_number),
      address = COALESCE(EXCLUDED.address, profiles.address),
      admin_id = COALESCE(EXCLUDED.admin_id, profiles.admin_id),
      updated_at = NOW()
    RETURNING id INTO v_profile_id;
  END IF;

  -- Record provider link
  IF v_profile_id IS NOT NULL AND v_provider_uid IS NOT NULL THEN
    INSERT INTO auth_providers (profile_id, provider, provider_uid, last_used_at, metadata)
    VALUES (v_profile_id, v_provider, v_provider_uid, NOW(),
      jsonb_build_object('avatar_url', v_avatar_url, 'name', v_name))
    ON CONFLICT (provider, provider_uid) DO UPDATE SET
      last_used_at = NOW(),
      metadata = jsonb_build_object('avatar_url', v_avatar_url, 'name', v_name);
  END IF;

  -- Shop settings for admin (original behavior preserved)
  IF v_role = 'admin' THEN
    INSERT INTO public.shop_settings (user_id, shop_name, address)
    VALUES (NEW.id, COALESCE(v_shop_name, v_hotel_name), v_address)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET
      shop_name = COALESCE(EXCLUDED.shop_name, shop_settings.shop_name),
      address = COALESCE(EXCLUDED.address, shop_settings.address);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;
