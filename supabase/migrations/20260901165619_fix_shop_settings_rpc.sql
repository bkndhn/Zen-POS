-- Create logos bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;

-- Allow public access
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'logos' );

-- Allow authenticated users to upload
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'logos' AND auth.role() = 'authenticated' );

-- Allow authenticated users to update
CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE USING ( bucket_id = 'logos' AND auth.role() = 'authenticated' );

-- Allow authenticated users to delete
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE USING ( bucket_id = 'logos' AND auth.role() = 'authenticated' );


-- 1. Update get_public_shop_settings_for_branch
CREATE OR REPLACE FUNCTION public.get_public_shop_settings_for_branch(p_admin_id uuid, p_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function
DECLARE
  v_user uuid;
  v_main uuid;
  v_main_row public.shop_settings%ROWTYPE;
  v_row public.shop_settings%ROWTYPE;
  v_allow_qr boolean;
BEGIN
  SELECT user_id, COALESCE((client_permissions->>'allow_qr_menu')::boolean, true)
  INTO v_user, v_allow_qr
  FROM public.profiles
  WHERE id = p_admin_id LIMIT 1;

  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_main FROM public.branches
    WHERE admin_id = p_admin_id AND is_main LIMIT 1;
  IF v_main IS NOT NULL THEN
    SELECT * INTO v_main_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = v_main LIMIT 1;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings
      WHERE user_id = v_user AND branch_id = p_branch_id LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    IF v_main_row.id IS NOT NULL THEN
      v_row := v_main_row;
    ELSE
      SELECT * INTO v_row FROM public.shop_settings
        WHERE user_id = v_user ORDER BY branch_id NULLS LAST LIMIT 1;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN RETURN NULL; END IF;

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
    'menu_layout_style', v_row.menu_layout_style,
    'menu_font_family', v_row.menu_font_family,
    'menu_border_radius', v_row.menu_border_radius,
    'menu_glassmorphism', v_row.menu_glassmorphism,
    'menu_ai_features_enabled', v_row.menu_ai_features_enabled,
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
    'cover_photo_url', COALESCE(v_row.cover_photo_url, v_main_row.cover_photo_url),
    'promo_reel_url', COALESCE(v_row.promo_reel_url, v_main_row.promo_reel_url),
    'promo_reel_image_url', COALESCE(v_row.promo_reel_image_url, v_main_row.promo_reel_image_url)
  ) || jsonb_build_object(
    'upi_id', v_row.upi_id,
    'upi_name', v_row.upi_name,
    'qr_payment_enabled', v_row.qr_payment_enabled,
    'operating_hours', COALESCE(v_row.operating_hours, v_main_row.operating_hours),
    'store_status_override', v_row.store_status_override,
    'allow_qr_menu', v_allow_qr,
    'public_ordering_enabled', public.is_public_ordering_enabled(p_admin_id),
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
    'table_qr_protection', v_row.table_qr_protection
  );
END;
$function;

-- 2. Update get_public_shop_settings
CREATE OR REPLACE FUNCTION public.get_public_shop_settings(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function
  SELECT jsonb_build_object(
    'shop_name', shop_name,
    'address', address,
    'contact_number', contact_number,
    'logo_url', logo_url,
    'menu_primary_color', menu_primary_color,
    'menu_secondary_color', menu_secondary_color,
    'menu_background_color', menu_background_color,
    'menu_text_color', menu_text_color,
    'menu_items_per_row', menu_items_per_row,
    'menu_show_address', menu_show_address,
    'menu_show_phone', menu_show_phone,
    'menu_show_shop_name', menu_show_shop_name,
    'menu_show_category_header', menu_show_category_header,
    'menu_slug', menu_slug,
    'gst_enabled', gst_enabled,
    'gstin', gstin,
    'is_composition_scheme', is_composition_scheme,
    'composition_rate', composition_rate,
    'facebook', facebook,
    'instagram', instagram,
    'whatsapp', whatsapp,
    'show_facebook', show_facebook,
    'show_instagram', show_instagram,
    'show_whatsapp', show_whatsapp,
    'cover_photo_url', cover_photo_url,
    'promo_reel_url', promo_reel_url,
    'promo_reel_image_url', promo_reel_image_url
  )
  FROM shop_settings
  WHERE user_id = p_user_id
  LIMIT 1;
$function;

-- 3. Update get_public_shop_settings_by_profile
CREATE OR REPLACE FUNCTION public.get_public_shop_settings_by_profile(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function
  SELECT jsonb_build_object(
    'shop_name', ss.shop_name,
    'address', ss.address,
    'contact_number', ss.contact_number,
    'logo_url', ss.logo_url,
    'menu_primary_color', ss.menu_primary_color,
    'menu_secondary_color', ss.menu_secondary_color,
    'menu_background_color', ss.menu_background_color,
    'menu_text_color', ss.menu_text_color,
    'menu_items_per_row', ss.menu_items_per_row,
    'menu_show_address', ss.menu_show_address,
    'menu_show_phone', ss.menu_show_phone,
    'menu_show_shop_name', ss.menu_show_shop_name,
    'menu_show_category_header', ss.menu_show_category_header,
    'menu_slug', ss.menu_slug,
    'gst_enabled', ss.gst_enabled,
    'gstin', ss.gstin,
    'is_composition_scheme', ss.is_composition_scheme,
    'composition_rate', ss.composition_rate,
    'facebook', ss.facebook,
    'instagram', ss.instagram,
    'whatsapp', ss.whatsapp,
    'show_facebook', ss.show_facebook,
    'show_instagram', ss.show_instagram,
    'show_whatsapp', ss.show_whatsapp,
    'cover_photo_url', ss.cover_photo_url,
    'promo_reel_url', ss.promo_reel_url,
    'promo_reel_image_url', ss.promo_reel_image_url
  )
  FROM shop_settings ss
  JOIN profiles p ON p.user_id = ss.user_id
  WHERE p.id = p_profile_id
  LIMIT 1;
$function;
