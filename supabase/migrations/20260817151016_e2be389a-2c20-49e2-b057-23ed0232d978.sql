
-- 1) Public abuse protection counters
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, bucket_key, window_start)
);

GRANT ALL ON public.public_rate_limits TO service_role;
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin reads rate limits"
ON public.public_rate_limits FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_public_rate_limits_window ON public.public_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.public_rate_limit_hit(
  p_scope text, p_key text, p_max integer, p_window_seconds integer, p_admin_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN false;
  END IF;

  v_window := to_timestamp(floor(extract(epoch FROM now()) / GREATEST(p_window_seconds,1)) * GREATEST(p_window_seconds,1));

  INSERT INTO public.public_rate_limits (scope, bucket_key, window_start, hits, admin_id)
  VALUES (p_scope, left(p_key, 200), v_window, 1, p_admin_id)
  ON CONFLICT (scope, bucket_key, window_start)
  DO UPDATE SET hits = public.public_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- opportunistic cleanup of stale counters
  IF random() < 0.02 THEN
    DELETE FROM public.public_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_hits <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.public_rate_limit_hit(text, text, integer, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.public_rate_limit_hit(text, text, integer, integer, uuid) TO service_role;

-- 2) Harden public table ordering RPC with payload validation + per-shop throttling
CREATE OR REPLACE FUNCTION public.public_place_table_order(
  p_admin_id uuid, p_branch_id uuid, p_table_number text, p_session_id text, p_seat_id text,
  p_order_scope text, p_order_number integer, p_items jsonb, p_total_amount numeric, p_customer_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_created timestamptz;
  v_cfg jsonb;
  v_max_cook integer := 0;
  v_eta integer;
  v_item_count integer;
  v_max_qty numeric;
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

  -- payload sanity limits (abuse protection)
  v_item_count := COALESCE(jsonb_array_length(COALESCE(p_items, '[]'::jsonb)), 0);
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
  IF v_item_count > 60 THEN
    RAISE EXCEPTION 'Too many items in a single order';
  END IF;
  IF length(COALESCE(p_customer_note, '')) > 500 THEN
    RAISE EXCEPTION 'Note is too long';
  END IF;
  IF COALESCE(p_total_amount, 0) < 0 OR COALESCE(p_total_amount, 0) > 500000 THEN
    RAISE EXCEPTION 'Invalid order total';
  END IF;
  SELECT COALESCE(MAX((e->>'quantity')::numeric), 0) INTO v_max_qty
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e;
  IF v_max_qty > 200 THEN
    RAISE EXCEPTION 'Invalid item quantity';
  END IF;

  -- per-session limit (existing) + per-table and per-shop throttles
  IF NOT public.check_table_order_rate_limit(p_session_id, p_table_number, p_admin_id) THEN
    RAISE EXCEPTION 'Too many orders, please try again shortly';
  END IF;

  IF NOT public.public_rate_limit_hit('table_order_session', p_session_id, 12, 300, p_admin_id) THEN
    RAISE EXCEPTION 'Too many orders from this device. Please wait a few minutes.';
  END IF;

  IF NOT public.public_rate_limit_hit('table_order_table',
       p_admin_id::text || ':' || COALESCE(p_branch_id::text, '-') || ':' || p_table_number, 25, 300, p_admin_id) THEN
    RAISE EXCEPTION 'Too many orders for this table. Please wait a few minutes.';
  END IF;

  IF NOT public.public_rate_limit_hit('table_order_shop',
       p_admin_id::text || ':' || COALESCE(p_branch_id::text, '-'), 200, 300, p_admin_id) THEN
    RAISE EXCEPTION 'Ordering is temporarily busy. Please try again shortly.';
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
$$;

-- 3) Throttle remote (QR takeaway/delivery) orders at DB level
CREATE OR REPLACE FUNCTION public.throttle_remote_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.device_id IS NOT NULL AND NOT public.public_rate_limit_hit(
      'remote_order_device', NEW.device_id, 8, 300, NEW.admin_id) THEN
    RAISE EXCEPTION 'Too many orders from this device. Please wait a few minutes.';
  END IF;

  IF NEW.admin_id IS NOT NULL AND NOT public.public_rate_limit_hit(
      'remote_order_shop', NEW.admin_id::text || ':' || COALESCE(NEW.branch_id::text, '-'), 200, 300, NEW.admin_id) THEN
    RAISE EXCEPTION 'Ordering is temporarily busy. Please try again shortly.';
  END IF;

  IF COALESCE(jsonb_array_length(COALESCE(NEW.items, '[]'::jsonb)), 0) > 60 THEN
    RAISE EXCEPTION 'Too many items in a single order';
  END IF;

  IF COALESCE(NEW.total_amount, 0) < 0 OR COALESCE(NEW.total_amount, 0) > 500000 THEN
    RAISE EXCEPTION 'Invalid order total';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_throttle_remote_orders ON public.remote_orders;
CREATE TRIGGER trg_throttle_remote_orders
BEFORE INSERT ON public.remote_orders
FOR EACH ROW EXECUTE FUNCTION public.throttle_remote_orders();

-- 4) Storage usage alerts at 80% / 95%, raised automatically when usage is recomputed
CREATE OR REPLACE FUNCTION public.raise_admin_storage_alerts(p_admin_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_q record;
  v_u record;
  v_created integer := 0;
  v_kind text;
  v_pct numeric;
  v_threshold integer;
BEGIN
  SELECT db_quota_mb, file_quota_mb INTO v_q FROM public.admin_storage_quotas WHERE admin_id = p_admin_id;
  SELECT db_bytes, file_bytes INTO v_u FROM public.admin_storage_usage WHERE admin_id = p_admin_id;
  IF v_u IS NULL THEN RETURN 0; END IF;

  FOREACH v_kind IN ARRAY ARRAY['database','files'] LOOP
    IF v_kind = 'database' THEN
      CONTINUE WHEN v_q.db_quota_mb IS NULL OR v_q.db_quota_mb <= 0;
      v_pct := round((COALESCE(v_u.db_bytes,0)::numeric / (v_q.db_quota_mb * 1048576)) * 100, 2);
    ELSE
      CONTINUE WHEN v_q.file_quota_mb IS NULL OR v_q.file_quota_mb <= 0;
      v_pct := round((COALESCE(v_u.file_bytes,0)::numeric / (v_q.file_quota_mb * 1048576)) * 100, 2);
    END IF;

    v_threshold := CASE WHEN v_pct >= 95 THEN 95 WHEN v_pct >= 80 THEN 80 ELSE NULL END;
    IF v_threshold IS NULL THEN CONTINUE; END IF;

    -- avoid duplicate alerts for the same threshold within 24h
    IF EXISTS (
      SELECT 1 FROM public.admin_storage_alerts a
      WHERE a.admin_id = p_admin_id AND a.kind = v_kind AND a.threshold = v_threshold
        AND a.created_at > now() - interval '24 hours'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.admin_storage_alerts (admin_id, kind, threshold, percent, acknowledged)
    VALUES (p_admin_id, v_kind, v_threshold, v_pct, false);
    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_admin_storage_alerts(uuid) TO authenticated, service_role;

-- recompute usage for every admin and raise alerts (called by cron)
CREATE OR REPLACE FUNCTION public.sweep_admin_storage_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_total integer := 0;
BEGIN
  FOR r IN SELECT admin_id FROM public.admin_storage_quotas LOOP
    PERFORM public.calc_admin_storage_usage(r.admin_id);
    v_total := v_total + public.raise_admin_storage_alerts(r.admin_id);
  END LOOP;
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_admin_storage_alerts() TO service_role;
