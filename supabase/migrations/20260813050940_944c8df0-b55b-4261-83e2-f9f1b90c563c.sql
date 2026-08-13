ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cooking_time_mins integer;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS default_cooking_time_mins integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS kitchen_busy_buffer_mins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kitchen_busy_until timestamptz;

ALTER TABLE public.table_orders
  ADD COLUMN IF NOT EXISTS eta_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_started_at timestamptz;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS eta_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_updated_at timestamptz;

DROP FUNCTION IF EXISTS public.get_public_menu_items(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_public_menu_items(p_admin_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, price numeric, image_url text, video_url text, media_type text, category text, unit text, base_value numeric, is_active boolean, branch_id uuid, tax_rate_id uuid, is_tax_inclusive boolean, is_saleable boolean, cooking_time_mins integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.name, i.price, i.image_url, i.video_url, i.media_type,
         i.category, i.unit, i.base_value, i.is_active, i.branch_id,
         i.tax_rate_id, i.is_tax_inclusive,
         COALESCE(i.is_saleable, true) AS is_saleable,
         i.cooking_time_mins
  FROM public.items i
  WHERE i.admin_id = p_admin_id
    AND i.is_active = true
    AND COALESCE(i.is_saleable, true) = true
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
  ORDER BY i.category NULLS LAST, i.name;
$function$;

-- Effective prep config for a shop/branch (used by the public portal to show ETA before ordering)
CREATE OR REPLACE FUNCTION public.get_public_prep_config(p_admin_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_default integer := 10;
  v_buffer integer := 0;
  v_until timestamptz;
BEGIN
  SELECT p.user_id INTO v_user_id FROM public.profiles p WHERE p.id = p_admin_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('default_cooking_time_mins', v_default, 'busy_buffer_mins', 0);
  END IF;

  SELECT COALESCE(s.default_cooking_time_mins, 10), COALESCE(s.kitchen_busy_buffer_mins, 0), s.kitchen_busy_until
    INTO v_default, v_buffer, v_until
  FROM public.shop_settings s
  WHERE s.user_id = v_user_id
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id OR s.branch_id IS NULL)
  ORDER BY (s.branch_id = p_branch_id) DESC NULLS LAST
  LIMIT 1;

  IF v_until IS NOT NULL AND v_until < now() THEN
    v_buffer := 0;
  END IF;

  RETURN jsonb_build_object(
    'default_cooking_time_mins', COALESCE(v_default, 10),
    'busy_buffer_mins', COALESCE(v_buffer, 0),
    'busy_until', v_until
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_prep_config(uuid, uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_session_orders(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.get_public_session_orders(p_admin_id uuid, p_branch_id uuid, p_session_id text)
 RETURNS TABLE(id uuid, order_number integer, items jsonb, total_amount numeric, status text, customer_note text, created_at timestamp with time zone, is_billed boolean, eta_minutes integer, eta_updated_at timestamp with time zone, prep_started_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.order_number, t.items, t.total_amount, t.status::text,
         t.customer_note, t.created_at, COALESCE(t.is_billed, false),
         t.eta_minutes, t.eta_updated_at, t.prep_started_at
  FROM public.table_orders t
  WHERE t.admin_id = p_admin_id
    AND t.session_id = p_session_id
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
  ORDER BY t.order_number;
$function$;

CREATE OR REPLACE FUNCTION public.public_place_table_order(p_admin_id uuid, p_branch_id uuid, p_table_number text, p_session_id text, p_seat_id text, p_order_scope text, p_order_number integer, p_items jsonb, p_total_amount numeric, p_customer_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_created timestamptz;
  v_cfg jsonb;
  v_max_cook integer := 0;
  v_eta integer;
BEGIN
  IF p_admin_id IS NULL OR p_table_number IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Invalid order request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_admin_id
      AND p.role = 'admin'::app_role
      AND COALESCE(p.status, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'Shop not available';
  END IF;

  IF NOT public.check_table_order_rate_limit(p_session_id, p_table_number, p_admin_id) THEN
    RAISE EXCEPTION 'Too many orders, please try again shortly';
  END IF;

  v_cfg := public.get_public_prep_config(p_admin_id, p_branch_id);

  SELECT COALESCE(MAX(i.cooking_time_mins), 0) INTO v_max_cook
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
  JOIN public.items i
    ON i.admin_id = p_admin_id
   AND i.id::text = (e->>'id')
  WHERE (e->>'id') ~ '^[0-9a-fA-F-]{36}$';

  IF v_max_cook IS NULL OR v_max_cook = 0 THEN
    v_max_cook := COALESCE((v_cfg->>'default_cooking_time_mins')::int, 10);
  END IF;

  v_eta := v_max_cook + COALESCE((v_cfg->>'busy_buffer_mins')::int, 0);

  INSERT INTO public.table_orders (
    admin_id, branch_id, table_number, session_id, seat_id, seat_label,
    order_scope, order_number, items, total_amount, customer_note, status,
    eta_minutes, eta_updated_at
  ) VALUES (
    p_admin_id, p_branch_id, p_table_number, p_session_id, p_seat_id, p_seat_id,
    COALESCE(p_order_scope, 'table'), COALESCE(p_order_number, 1),
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_total_amount, 0), p_customer_note, 'pending',
    v_eta, now()
  )
  RETURNING id, created_at INTO v_id, v_created;

  RETURN jsonb_build_object('id', v_id, 'created_at', v_created, 'eta_minutes', v_eta);
END;
$function$;