
-- Resolve a public menu slug to (admin_id, branch_id).
-- Priority: branches.menu_slug (per-branch) > shop_settings.menu_slug (admin-level → main branch).
CREATE OR REPLACE FUNCTION public.resolve_menu_target(p_slug text)
RETURNS TABLE(admin_id uuid, branch_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_branch uuid;
BEGIN
  -- 1) Per-branch slug
  SELECT b.admin_id, b.id INTO v_admin, v_branch
  FROM public.branches b
  WHERE b.menu_slug = p_slug AND COALESCE(b.is_active, true) = true
  LIMIT 1;
  IF v_admin IS NOT NULL THEN
    RETURN QUERY SELECT v_admin, v_branch;
    RETURN;
  END IF;

  -- 2) Admin-level slug (shop_settings) → return admin's main branch
  SELECT p.id INTO v_admin
  FROM public.shop_settings ss
  JOIN public.profiles p ON p.user_id = ss.user_id AND p.role = 'admin'
  WHERE ss.menu_slug = p_slug
  LIMIT 1;

  IF v_admin IS NOT NULL THEN
    SELECT id INTO v_branch FROM public.branches
      WHERE branches.admin_id = v_admin AND is_main LIMIT 1;
    RETURN QUERY SELECT v_admin, v_branch;
    RETURN;
  END IF;
END;
$$;

-- Branch-scoped public shop settings (falls back to main branch then any branch).
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
    'shop_longitude', v_row.shop_longitude
  );
END;
$$;

-- Allow anon to call them (read-only)
GRANT EXECUTE ON FUNCTION public.resolve_menu_target(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_shop_settings_for_branch(uuid, uuid) TO anon, authenticated;
