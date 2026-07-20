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
  v_main_row public.shop_settings%ROWTYPE;
  v_row public.shop_settings%ROWTYPE;
  v_allow_qr boolean;
BEGIN
  -- Extract user_id AND allow_qr_menu from profile
  SELECT user_id, COALESCE((client_permissions->>'allow_qr_menu')::boolean, true)
  INTO v_user, v_allow_qr 
  FROM public.profiles 
  WHERE id = p_admin_id LIMIT 1;
  
  IF v_user IS NULL THEN RETURN NULL; END IF;

  -- 1) Load Main-branch row for fallback
  SELECT id INTO v_main FROM public.branches
    WHERE admin_id = p_admin_id AND is_main LIMIT 1;
  IF v_main IS NOT NULL THEN
    SELECT * INTO v_main_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = v_main LIMIT 1;
  END IF;

  -- 2) Load requested branch row
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = p_branch_id LIMIT 1;
  END IF;

  -- 3) If no requested branch row found, fallback entirely to main row or any row
  IF v_row.id IS NULL THEN
    IF v_main_row.id IS NOT NULL THEN
      v_row := v_main_row;
    ELSE
      SELECT * INTO v_row FROM public.shop_settings
        WHERE user_id = v_user ORDER BY branch_id NULLS LAST LIMIT 1;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN RETURN NULL; END IF;

  -- Return object with COALESCE to main branch for key details if missing in sub-branch
  RETURN jsonb_build_object(
    'shop_name', COALESCE(v_row.shop_name, v_main_row.shop_name),
    'address', COALESCE(v_row.address, v_main_row.address),
    'contact_number', COALESCE(v_row.contact_number, v_main_row.contact_number),
    'logo_url', COALESCE(v_row.logo_url, v_main_row.logo_url),
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
    'gst_enabled', COALESCE(v_row.gst_enabled, v_main_row.gst_enabled, false),
    'gstin', COALESCE(v_row.gstin, v_main_row.gstin),
    'is_composition_scheme', COALESCE(v_row.is_composition_scheme, v_main_row.is_composition_scheme, false),
    'composition_rate', COALESCE(v_row.composition_rate, v_main_row.composition_rate),
    'facebook', COALESCE(v_row.facebook, v_main_row.facebook),
    'instagram', COALESCE(v_row.instagram, v_main_row.instagram),
    'whatsapp', COALESCE(v_row.whatsapp, v_main_row.whatsapp),
    'show_facebook', COALESCE(v_row.show_facebook, v_main_row.show_facebook, true),
    'show_instagram', COALESCE(v_row.show_instagram, v_main_row.show_instagram, true),
    'show_whatsapp', COALESCE(v_row.show_whatsapp, v_main_row.show_whatsapp, true),
    'shop_latitude', COALESCE(v_row.shop_latitude, v_main_row.shop_latitude),
    'shop_longitude', COALESCE(v_row.shop_longitude, v_main_row.shop_longitude),
    'menu_layout_style', v_row.menu_layout_style,
    'menu_font_family', v_row.menu_font_family,
    'menu_border_radius', v_row.menu_border_radius,
    'menu_glassmorphism', v_row.menu_glassmorphism,
    'menu_ai_features_enabled', v_row.menu_ai_features_enabled,
    'store_status_override', v_row.store_status_override,
    'operating_hours', COALESCE(v_row.operating_hours, v_main_row.operating_hours),
    'allow_qr_menu', v_allow_qr
  );
END;
$$;
