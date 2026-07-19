ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS store_status_override text DEFAULT 'auto';
ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS operating_hours jsonb DEFAULT '{}'::jsonb;

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

  -- 1) Branch row
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = p_branch_id LIMIT 1;
  END IF;

  -- 2) Main-branch fallback
  IF NOT FOUND THEN
    SELECT id INTO v_main FROM public.branches
      WHERE admin_id = p_admin_id AND is_main LIMIT 1;
    IF v_main IS NOT NULL THEN
      SELECT * INTO v_row FROM public.shop_settings
        WHERE user_id = v_user AND branch_id = v_main LIMIT 1;
    END IF;
  END IF;

  -- 3) Any branch fallback
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
    'menu_layout_style', v_row.menu_layout_style,
    'menu_font_family', v_row.menu_font_family,
    'menu_border_radius', v_row.menu_border_radius,
    'menu_glassmorphism', v_row.menu_glassmorphism,
    'menu_ai_features_enabled', v_row.menu_ai_features_enabled,
    'store_status_override', v_row.store_status_override,
    'operating_hours', v_row.operating_hours
  );
END;
$$;
