ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS remote_payment_methods text NOT NULL DEFAULT 'both';

DO $$ BEGIN
  ALTER TABLE public.shop_settings
    ADD CONSTRAINT shop_settings_remote_payment_methods_chk
    CHECK (remote_payment_methods IN ('both','online_only','cod_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.shop_settings
   SET remote_payment_methods = 'online_only'
 WHERE require_payment_before_order = true AND remote_payment_methods = 'both';

-- Resolve the effective shop_settings row for a public order (branch row, else main branch, else any)
CREATE OR REPLACE FUNCTION public.resolve_public_payment_settings(p_admin_id uuid, p_branch_id uuid)
RETURNS TABLE(payment_methods text, upi_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid;
  v_main uuid;
  v_row public.shop_settings%ROWTYPE;
  v_main_row public.shop_settings%ROWTYPE;
BEGIN
  SELECT p.user_id INTO v_user FROM public.profiles p WHERE p.id = p_admin_id LIMIT 1;
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT b.id INTO v_main FROM public.branches b WHERE b.admin_id = p_admin_id AND b.is_main LIMIT 1;
  IF v_main IS NOT NULL THEN
    SELECT * INTO v_main_row FROM public.shop_settings s WHERE s.user_id = v_user AND s.branch_id = v_main LIMIT 1;
  END IF;
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings s WHERE s.user_id = v_user AND s.branch_id = p_branch_id LIMIT 1;
  END IF;
  IF v_row.id IS NULL THEN
    IF v_main_row.id IS NOT NULL THEN v_row := v_main_row;
    ELSE SELECT * INTO v_row FROM public.shop_settings s WHERE s.user_id = v_user ORDER BY s.branch_id NULLS LAST LIMIT 1;
    END IF;
  END IF;
  IF v_row.id IS NULL THEN RETURN; END IF;
  payment_methods := COALESCE(v_row.remote_payment_methods,
                       CASE WHEN v_row.require_payment_before_order THEN 'online_only' ELSE 'both' END);
  upi_id := NULLIF(trim(COALESCE(v_row.upi_id, '')), '');
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_public_payment_settings(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Enforce the shop's payment choice on every customer-placed remote order (RPC and direct insert)
CREATE OR REPLACE FUNCTION public.enforce_remote_order_payment_method()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_methods text;
  v_upi text;
  v_is_upi boolean;
BEGIN
  -- Shop staff entering orders themselves are not restricted
  IF auth.uid() IS NOT NULL AND public.has_branch_write_access(NEW.admin_id, NEW.branch_id) THEN
    RETURN NEW;
  END IF;

  SELECT r.payment_methods, r.upi_id INTO v_methods, v_upi
    FROM public.resolve_public_payment_settings(NEW.admin_id, NEW.branch_id) r;
  v_methods := COALESCE(v_methods, 'both');

  v_is_upi := lower(COALESCE(NEW.payment_mode, '')) = 'upi' OR lower(COALESCE(NEW.payment_method, '')) = 'upi';

  IF v_is_upi THEN
    IF v_methods = 'cod_only' THEN
      RAISE EXCEPTION 'This shop accepts pay on delivery/pickup only';
    END IF;
    IF v_upi IS NULL THEN
      RAISE EXCEPTION 'Online payment is not set up for this shop';
    END IF;
    IF COALESCE(trim(NEW.payment_reference), '') = '' THEN
      RAISE EXCEPTION 'Please enter your UPI payment reference';
    END IF;
    NEW.payment_mode := 'upi';
    NEW.payment_method := 'upi';
  ELSE
    IF v_methods = 'online_only' THEN
      RAISE EXCEPTION 'This shop accepts online payment only';
    END IF;
    NEW.payment_mode := 'pay_on_pickup';
    NEW.payment_method := 'pay_on_pickup';
    NEW.payment_reference := NULL;
  END IF;

  -- Customers can never mark their own order as paid
  NEW.is_paid := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_remote_order_payment_method ON public.remote_orders;
CREATE TRIGGER trg_enforce_remote_order_payment_method
  BEFORE INSERT ON public.remote_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_remote_order_payment_method();

-- Save the customer's UPI reference
CREATE OR REPLACE FUNCTION public.public_place_remote_order(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_branch_id uuid;
  v_device_id text;
  v_order_num integer;
  v_id uuid;
  v_created timestamptz;
BEGIN
  v_admin_id := (p_order->>'admin_id')::uuid;
  v_branch_id := NULLIF(p_order->>'branch_id', '')::uuid;
  v_device_id := p_order->>'device_id';

  IF v_admin_id IS NULL OR v_device_id IS NULL THEN
    RAISE EXCEPTION 'Invalid order parameters';
  END IF;

  IF NOT public.is_public_ordering_enabled(v_admin_id) THEN
    RAISE EXCEPTION 'Online ordering is disabled for this shop';
  END IF;

  v_order_num := public.get_next_remote_order_number(v_admin_id, v_branch_id);

  INSERT INTO public.remote_orders (
    admin_id, branch_id, device_id, order_number, customer_name, customer_phone, order_type,
    customer_address, delivery_address, delivery_distance_km, is_scheduled, scheduled_for,
    subtotal, tax_total, delivery_fee, packaging_fee, surge_fee, tip_amount, total_amount,
    payment_mode, payment_method, payment_reference, status, pickup_pin, items, is_paid
  ) VALUES (
    v_admin_id, v_branch_id, v_device_id, v_order_num,
    COALESCE(p_order->>'customer_name', 'Guest'),
    p_order->>'customer_phone',
    COALESCE(p_order->>'order_type', 'pickup'),
    p_order->>'customer_address',
    p_order->>'delivery_address',
    (p_order->>'delivery_distance_km')::numeric,
    COALESCE((p_order->>'is_scheduled')::boolean, false),
    (p_order->>'scheduled_for')::timestamptz,
    COALESCE((p_order->>'subtotal')::numeric, 0),
    COALESCE((p_order->>'tax_total')::numeric, 0),
    COALESCE((p_order->>'delivery_fee')::numeric, 0),
    COALESCE((p_order->>'packaging_fee')::numeric, 0),
    COALESCE((p_order->>'surge_fee')::numeric, 0),
    COALESCE((p_order->>'tip_amount')::numeric, 0),
    COALESCE((p_order->>'total_amount')::numeric, 0),
    COALESCE(p_order->>'payment_mode', 'pay_on_pickup'),
    p_order->>'payment_method',
    NULLIF(left(trim(COALESCE(p_order->>'payment_reference', '')), 64), ''),
    'pending',
    COALESCE(p_order->>'pickup_pin', '0000'),
    COALESCE(p_order->'items', '[]'::jsonb),
    false
  )
  RETURNING id, created_at INTO v_id, v_created;

  RETURN jsonb_build_object('id', v_id, 'order_number', v_order_num, 'created_at', v_created);
END;
$function$;

-- Expose the payment choice to the public menu
CREATE OR REPLACE FUNCTION public.get_public_shop_settings_for_branch(p_admin_id uuid, p_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  ) || jsonb_build_object(
    'remote_payment_methods', COALESCE(v_row.remote_payment_methods,
        CASE WHEN v_row.require_payment_before_order THEN 'online_only' ELSE 'both' END),
    'require_payment_before_order', COALESCE(v_row.require_payment_before_order, false),
    'require_payment_before_table_order', COALESCE(v_row.require_payment_before_table_order, false)
  );
END;
$function$;