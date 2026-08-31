-- 1. Composite indexes for hot query paths (admin_id + created_at)
CREATE INDEX IF NOT EXISTS idx_bills_admin_created ON public.bills (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON public.bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_remote_orders_admin_created ON public.remote_orders (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rum_events_created ON public.rum_events (created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_created ON public.public_rate_limits (created_at);

-- 2. Retention cleanup function (service role / cron only)
CREATE OR REPLACE FUNCTION public.prune_diagnostic_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rum int; v_audit int; v_rate int; v_push int; v_ai int;
BEGIN
  DELETE FROM public.rum_events WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_rum = ROW_COUNT;

  DELETE FROM public.security_audit_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  DELETE FROM public.public_rate_limits WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_rate = ROW_COUNT;

  DELETE FROM public.push_queue WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_push = ROW_COUNT;

  DELETE FROM public.ai_insights_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_ai = ROW_COUNT;

  RETURN jsonb_build_object(
    'rum_events', v_rum,
    'security_audit_log', v_audit,
    'public_rate_limits', v_rate,
    'push_queue', v_push,
    'ai_insights_log', v_ai,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_diagnostic_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_diagnostic_tables() TO service_role;

-- 3. Schedule daily retention at 04:10 UTC (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('zenpos-diagnostic-retention');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'zenpos-diagnostic-retention',
  '10 4 * * *',
  $$SELECT public.prune_diagnostic_tables();$$
);

-- 4. Backend health RPC for super admin monitoring
CREATE OR REPLACE FUNCTION public.get_backend_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_bytes bigint;
  v_storage_bytes bigint;
  v_tables jsonb;
  v_free_tier_bytes bigint := 500 * 1024 * 1024; -- 500 MB free tier DB
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_storage_bytes
  FROM storage.objects;

  SELECT jsonb_agg(t ORDER BY t.bytes DESC) INTO v_tables
  FROM (
    SELECT c.relname AS name,
           pg_total_relation_size(c.oid) AS bytes,
           s.n_live_tup AS rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'db_bytes', v_db_bytes,
    'db_size', pg_size_pretty(v_db_bytes),
    'free_tier_bytes', v_free_tier_bytes,
    'free_tier_pct_used', round((v_db_bytes::numeric / v_free_tier_bytes) * 100, 2),
    'storage_bytes', v_storage_bytes,
    'storage_size', pg_size_pretty(v_storage_bytes),
    'top_tables', COALESCE(v_tables, '[]'::jsonb),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_backend_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_backend_health() TO authenticated;