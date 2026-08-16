-- 1) Flag on admin profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_ordering_enabled boolean NOT NULL DEFAULT true;

-- 2) Only super admins may change the flag (clients cannot)
CREATE OR REPLACE FUNCTION public.guard_public_ordering_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.public_ordering_enabled IS DISTINCT FROM OLD.public_ordering_enabled
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change public ordering access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_public_ordering_flag_trg ON public.profiles;
CREATE TRIGGER guard_public_ordering_flag_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_public_ordering_flag();

-- 3) Helper: is public ordering allowed for an admin (tenant)
CREATE OR REPLACE FUNCTION public.is_public_ordering_enabled(p_admin_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT p.public_ordering_enabled FROM public.profiles p WHERE p.id = p_admin_id), true);
$$;

GRANT EXECUTE ON FUNCTION public.is_public_ordering_enabled(uuid) TO anon, authenticated;

-- 4) Enforce at write time for public/guest order tables
CREATE OR REPLACE FUNCTION public.enforce_public_ordering_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.admin_id IS NOT NULL AND NOT public.is_public_ordering_enabled(NEW.admin_id) THEN
    RAISE EXCEPTION 'Online ordering is disabled for this shop';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_public_ordering_remote_orders ON public.remote_orders;
CREATE TRIGGER enforce_public_ordering_remote_orders
  BEFORE INSERT ON public.remote_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_public_ordering_enabled();

DROP TRIGGER IF EXISTS enforce_public_ordering_table_orders ON public.table_orders;
CREATE TRIGGER enforce_public_ordering_table_orders
  BEFORE INSERT ON public.table_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_public_ordering_enabled();

-- 5) Expose the flag through the public settings RPC
CREATE OR REPLACE FUNCTION public.get_public_shop_settings_for_branch(
  p_admin_id uuid,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_main uuid;
  v_row public.shop_settings%ROWTYPE;
BEGIN
  SELECT user_id INTO v_user FROM public.profiles WHERE id = p_admin_id LIMIT 1;
  IF v_user IS NULL THEN RETURN NULL; END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = p_branch_id LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT id INTO v_main FROM public.branches
      WHERE admin_id = p_admin_id AND is_main LIMIT 1;
    IF v_main IS NOT NULL THEN
      SELECT * INTO v_row FROM public.shop_settings
        WHERE user_id = v_user AND branch_id = v_main LIMIT 1;
    END IF;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.shop_settings
      WHERE user_id = v_user ORDER BY branch_id NULLS LAST LIMIT 1;
  END IF;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'shop_name', v_row.shop_name,
    'address', v_row.address,
    'contact_number', v_row.contact_number,
    'logo_url', v_row.logo_url,
    'menu_primary_color', v_row.menu_primary_color,
    'menu_secondary_color', v_row.menu_secondary_color,
    'menu_background_color', v_row.menu_background_color,
    'menu_text_color', v_row.menu_text_color,
    'menu_items_per_row', v_row.menu_items_per_row,
    'menu_show_address', v_row.menu_show_address,
    'menu_show_phone', v_row.menu_show_phone,
    'menu_show_shop_name', v_row.menu_show_shop_name,
    'menu_show_category_header', v_row.menu_show_category_header,
    'menu_slug', v_row.menu_slug,
    'gst_enabled', v_row.gst_enabled,
    'gstin', v_row.gstin,
    'is_composition_scheme', v_row.is_composition_scheme,
    'composition_rate', v_row.composition_rate,
    'facebook', v_row.facebook,
    'instagram', v_row.instagram,
    'whatsapp', v_row.whatsapp,
    'show_facebook', v_row.show_facebook,
    'show_instagram', v_row.show_instagram,
    'show_whatsapp', v_row.show_whatsapp,
    'shop_latitude', v_row.shop_latitude,
    'shop_longitude', v_row.shop_longitude,
    'upi_id', v_row.upi_id,
    'upi_name', v_row.upi_name,
    'qr_payment_enabled', v_row.qr_payment_enabled,
    'operating_hours', v_row.operating_hours,
    'store_status_override', v_row.store_status_override,
    'allow_qr_menu', v_row.allow_qr_menu,
    'menu_layout_style', v_row.menu_layout_style,
    'menu_font_family', v_row.menu_font_family,
    'menu_border_radius', v_row.menu_border_radius,
    'menu_glassmorphism', v_row.menu_glassmorphism,
    'menu_ai_features_enabled', v_row.menu_ai_features_enabled,
    'remote_ordering_enabled', v_row.remote_ordering_enabled,
    'remote_ordering_paused', v_row.remote_ordering_paused,
    'remote_order_modes', v_row.remote_order_modes,
    'delivery_fee_mode', v_row.delivery_fee_mode,
    'delivery_fee_flat', v_row.delivery_fee_flat,
    'delivery_fee_base', v_row.delivery_fee_base,
    'delivery_fee_per_km', v_row.delivery_fee_per_km,
    'delivery_fee_free_km', v_row.delivery_fee_free_km,
    'max_delivery_radius_km', v_row.max_delivery_radius_km,
    'packaging_fee_mode', v_row.packaging_fee_mode,
    'packaging_fee_value', v_row.packaging_fee_value,
    'surge_fee_enabled', v_row.surge_fee_enabled,
    'surge_fee_amount', v_row.surge_fee_amount,
    'tipping_enabled', v_row.tipping_enabled,
    'table_qr_protection', v_row.table_qr_protection,
    'public_ordering_enabled', public.is_public_ordering_enabled(p_admin_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_shop_settings_for_branch(uuid, uuid) TO anon, authenticated;