-- 1) Stop public visitors from joining (and reading) another party's table session
REVOKE ALL ON FUNCTION public.adopt_public_table_session(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.adopt_public_table_session(uuid, uuid, text, text);

-- 2) Server-side pricing for customer-placed online orders
CREATE OR REPLACE FUNCTION public.enforce_remote_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid;
  v_main uuid;
  v_row public.shop_settings%ROWTYPE;
  v_main_row public.shop_settings%ROWTYPE;
  v_gst boolean;
  e jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_item_id_txt text;
  v_bv numeric;
  v_qty_raw numeric;
  v_disp_qty numeric;
  v_line numeric;
  v_rate numeric;
  v_subtotal numeric := 0;
  v_excl_tax numeric := 0;
  v_delivery numeric := 0;
  v_packaging numeric := 0;
  v_surge numeric := 0;
  v_tip numeric := 0;
  v_dist numeric;
  v_count int;
BEGIN
  -- Shop staff entering orders themselves keep their own prices
  IF auth.uid() IS NOT NULL AND public.has_branch_write_access(NEW.admin_id, NEW.branch_id) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_user FROM public.profiles p WHERE p.id = NEW.admin_id LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Shop not available';
  END IF;

  SELECT b.id INTO v_main FROM public.branches b WHERE b.admin_id = NEW.admin_id AND b.is_main LIMIT 1;
  IF v_main IS NOT NULL THEN
    SELECT * INTO v_main_row FROM public.shop_settings s WHERE s.user_id = v_user AND s.branch_id = v_main LIMIT 1;
  END IF;
  IF NEW.branch_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.shop_settings s WHERE s.user_id = v_user AND s.branch_id = NEW.branch_id LIMIT 1;
  END IF;
  IF v_row.id IS NULL THEN
    IF v_main_row.id IS NOT NULL THEN v_row := v_main_row;
    ELSE SELECT * INTO v_row FROM public.shop_settings s WHERE s.user_id = v_user ORDER BY s.branch_id NULLS LAST LIMIT 1;
    END IF;
  END IF;

  v_gst := COALESCE(v_row.gst_enabled, v_main_row.gst_enabled, false);

  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
  v_count := jsonb_array_length(NEW.items);
  IF v_count = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  IF v_count > 60 THEN RAISE EXCEPTION 'Too many items in a single order'; END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    v_item_id_txt := COALESCE(NULLIF(e->>'item_id', ''), e->>'id');
    IF v_item_id_txt IS NULL OR v_item_id_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'An item in your cart is no longer available';
    END IF;

    SELECT i.id, i.name, i.price, i.base_value, i.tax_rate_id, i.is_tax_inclusive
      INTO v_item
      FROM public.items i
     WHERE i.id = v_item_id_txt::uuid
       AND i.admin_id = NEW.admin_id
       AND i.is_active = true
       AND COALESCE(i.is_saleable, true) = true
       AND (NEW.branch_id IS NULL OR i.branch_id = NEW.branch_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item in your cart is no longer available';
    END IF;

    v_bv := COALESCE(NULLIF(v_item.base_value, 0), 1);
    BEGIN
      v_qty_raw := NULLIF(e->>'quantity', '')::numeric;
      IF v_qty_raw IS NULL THEN
        v_qty_raw := NULLIF(e->>'qty', '')::numeric * v_bv;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END;
    IF v_qty_raw IS NULL OR v_qty_raw <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;
    v_disp_qty := v_qty_raw / v_bv;
    IF v_disp_qty > 200 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    v_line := round(COALESCE(v_item.price, 0) * v_disp_qty, 2);
    v_subtotal := v_subtotal + v_line;

    IF v_gst AND v_item.tax_rate_id IS NOT NULL AND v_item.is_tax_inclusive IS NOT DISTINCT FROM false THEN
      SELECT COALESCE(t.rate, 0) + COALESCE(t.cess_rate, 0) INTO v_rate
        FROM public.tax_rates t
       WHERE t.id = v_item.tax_rate_id AND t.admin_id = v_user AND t.is_active = true;
      IF v_rate IS NOT NULL THEN
        v_excl_tax := v_excl_tax + (v_line * v_rate / 100);
      END IF;
    END IF;

    v_items := v_items || jsonb_build_array(
      (e - 'selected_modifiers' - 'customization_string') || jsonb_build_object(
        'item_id', v_item.id,
        'name', v_item.name,
        'price', v_item.price,
        'quantity', v_qty_raw,
        'qty', v_disp_qty,
        'base_value', v_bv,
        'tax_rate_id', v_item.tax_rate_id,
        'is_tax_inclusive', v_item.is_tax_inclusive,
        'selected_modifiers', '[]'::jsonb,
        'customization_string', '',
        'instructions', left(COALESCE(e->>'instructions', ''), 300)
      )
    );
  END LOOP;

  IF COALESCE(NEW.order_type, 'pickup') = 'delivery' THEN
    IF v_row.delivery_fee_mode = 'flat' THEN
      v_delivery := COALESCE(v_row.delivery_fee_flat, 0);
    ELSIF v_row.delivery_fee_mode = 'distance' THEN
      v_dist := GREATEST(COALESCE(NEW.delivery_distance_km, 0), 0);
      IF v_row.max_delivery_radius_km IS NOT NULL AND v_row.max_delivery_radius_km > 0
         AND v_dist > v_row.max_delivery_radius_km THEN
        RAISE EXCEPTION 'This address is outside the delivery range';
      END IF;
      NEW.delivery_distance_km := v_dist;
      v_delivery := COALESCE(v_row.delivery_fee_base, 0)
                  + GREATEST(0, v_dist - COALESCE(v_row.delivery_fee_free_km, 0)) * COALESCE(v_row.delivery_fee_per_km, 0);
    END IF;
  END IF;

  IF v_row.packaging_fee_mode = 'flat' THEN
    v_packaging := COALESCE(v_row.packaging_fee_value, 0);
  ELSIF v_row.packaging_fee_mode = 'percentage' THEN
    v_packaging := v_subtotal * COALESCE(v_row.packaging_fee_value, 0) / 100;
  END IF;

  IF COALESCE(v_row.surge_fee_enabled, false) THEN
    v_surge := COALESCE(v_row.surge_fee_amount, 0);
  END IF;

  IF COALESCE(v_row.tipping_enabled, false) THEN
    v_tip := LEAST(GREATEST(COALESCE(NEW.tip_amount, 0), 0), 10000);
  END IF;

  NEW.items := v_items;
  NEW.subtotal := round(v_subtotal, 2);
  NEW.tax_total := round(v_excl_tax, 2);
  NEW.delivery_fee := round(v_delivery, 2);
  NEW.packaging_fee := round(v_packaging, 2);
  NEW.surge_fee := round(v_surge, 2);
  NEW.tip_amount := round(v_tip, 2);
  NEW.total_amount := round(v_subtotal + v_excl_tax + v_delivery + v_packaging + v_surge + v_tip, 2);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_remote_order_pricing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_remote_order_pricing ON public.remote_orders;
CREATE TRIGGER trg_enforce_remote_order_pricing
  BEFORE INSERT ON public.remote_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_remote_order_pricing();