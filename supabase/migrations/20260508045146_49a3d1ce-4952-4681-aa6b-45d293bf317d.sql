
-- 1. Add missing branch_id columns first
ALTER TABLE public.bluetooth_settings ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS branch_id uuid;

-- 2. Backfill branch_id on all settings rows -> user's main branch
DO $$
DECLARE
  r record;
  v_admin uuid;
  v_main uuid;
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['shop_settings','bluetooth_settings','display_settings','user_preferences']
  LOOP
    FOR r IN EXECUTE format('SELECT id, user_id FROM public.%I WHERE branch_id IS NULL', v_tbl)
    LOOP
      SELECT CASE WHEN p.role = 'admin' THEN p.id ELSE p.admin_id END
        INTO v_admin FROM public.profiles p WHERE p.user_id = r.user_id LIMIT 1;
      IF v_admin IS NOT NULL THEN
        SELECT id INTO v_main FROM public.branches WHERE admin_id = v_admin AND is_main LIMIT 1;
        IF v_main IS NOT NULL THEN
          EXECUTE format('UPDATE public.%I SET branch_id = $1 WHERE id = $2', v_tbl)
            USING v_main, r.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Replace single-row uniqueness with (user_id, branch_id) uniqueness
ALTER TABLE public.shop_settings DROP CONSTRAINT IF EXISTS shop_settings_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_user_branch_uidx
  ON public.shop_settings (user_id, branch_id);

ALTER TABLE public.bluetooth_settings DROP CONSTRAINT IF EXISTS bluetooth_settings_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS bluetooth_settings_user_branch_uidx
  ON public.bluetooth_settings (user_id, branch_id);

ALTER TABLE public.display_settings DROP CONSTRAINT IF EXISTS display_settings_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS display_settings_user_branch_uidx
  ON public.display_settings (user_id, branch_id);

ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_branch_uidx
  ON public.user_preferences (user_id, branch_id);

-- 4. menu_slug: allow per-branch slugs (partial unique excluding NULL/empty)
ALTER TABLE public.shop_settings DROP CONSTRAINT IF EXISTS shop_settings_menu_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_menu_slug_partial_uidx
  ON public.shop_settings (menu_slug) WHERE menu_slug IS NOT NULL AND menu_slug <> '';
CREATE UNIQUE INDEX IF NOT EXISTS branches_menu_slug_partial_uidx
  ON public.branches (menu_slug) WHERE menu_slug IS NOT NULL AND menu_slug <> '';

-- 5. Customers per-branch
DO $$
DECLARE r record; v_main uuid;
BEGIN
  FOR r IN SELECT id, admin_id FROM public.customers WHERE branch_id IS NULL AND admin_id IS NOT NULL
  LOOP
    SELECT id INTO v_main FROM public.branches WHERE admin_id = r.admin_id AND is_main LIMIT 1;
    IF v_main IS NOT NULL THEN
      UPDATE public.customers SET branch_id = v_main WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_admin_id_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_admin_branch_phone_uidx
  ON public.customers (admin_id, branch_id, phone);
CREATE INDEX IF NOT EXISTS customers_branch_idx ON public.customers (branch_id);

-- 6. Promo banners index
CREATE INDEX IF NOT EXISTS promo_banners_branch_idx ON public.promo_banners (branch_id);

-- 7. Inheritance helper for shop_settings
CREATE OR REPLACE FUNCTION public.get_branch_scoped_shop_settings(
  p_user_id uuid, p_branch_id uuid
) RETURNS SETOF public.shop_settings
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid; v_main uuid; v_found public.shop_settings;
BEGIN
  SELECT * INTO v_found FROM public.shop_settings
   WHERE user_id = p_user_id AND branch_id = p_branch_id LIMIT 1;
  IF FOUND THEN RETURN NEXT v_found; RETURN; END IF;

  SELECT CASE WHEN p.role = 'admin' THEN p.id ELSE p.admin_id END
    INTO v_admin FROM public.profiles p WHERE p.user_id = p_user_id LIMIT 1;
  IF v_admin IS NOT NULL THEN
    SELECT id INTO v_main FROM public.branches WHERE admin_id = v_admin AND is_main LIMIT 1;
    IF v_main IS NOT NULL THEN
      SELECT * INTO v_found FROM public.shop_settings
        WHERE user_id = p_user_id AND branch_id = v_main LIMIT 1;
      IF FOUND THEN RETURN NEXT v_found; RETURN; END IF;
    END IF;
  END IF;

  SELECT * INTO v_found FROM public.shop_settings
    WHERE user_id = p_user_id ORDER BY branch_id NULLS LAST LIMIT 1;
  IF FOUND THEN RETURN NEXT v_found; END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_branch_scoped_shop_settings(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_scoped_shop_settings(uuid, uuid) TO authenticated;
