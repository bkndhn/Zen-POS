-- 1. Quotas
CREATE TABLE public.admin_storage_quotas (
  admin_id uuid PRIMARY KEY,
  db_quota_mb numeric,
  file_quota_mb numeric,
  cleanup_permission boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_storage_quotas TO authenticated;
GRANT ALL ON public.admin_storage_quotas TO service_role;
ALTER TABLE public.admin_storage_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages storage quotas" ON public.admin_storage_quotas
FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Tenant reads own storage quota" ON public.admin_storage_quotas
FOR SELECT TO authenticated
USING (admin_id IS NOT NULL AND admin_id IN (public.get_my_admin_id(), public.get_my_profile_id()));

CREATE TRIGGER trg_admin_storage_quotas_updated
BEFORE UPDATE ON public.admin_storage_quotas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Usage snapshot
CREATE TABLE public.admin_storage_usage (
  admin_id uuid PRIMARY KEY,
  db_bytes bigint NOT NULL DEFAULT 0,
  file_bytes bigint NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_storage_usage TO authenticated;
GRANT ALL ON public.admin_storage_usage TO service_role;
ALTER TABLE public.admin_storage_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads all storage usage" ON public.admin_storage_usage
FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE POLICY "Tenant reads own storage usage" ON public.admin_storage_usage
FOR SELECT TO authenticated
USING (admin_id IS NOT NULL AND admin_id IN (public.get_my_admin_id(), public.get_my_profile_id()));

CREATE TRIGGER trg_admin_storage_usage_updated
BEFORE UPDATE ON public.admin_storage_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Cleanup audit log
CREATE TABLE public.admin_cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  performed_by uuid,
  before_date date NOT NULL,
  deleted_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_cleanup_logs TO authenticated;
GRANT ALL ON public.admin_cleanup_logs TO service_role;
ALTER TABLE public.admin_cleanup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads cleanup logs" ON public.admin_cleanup_logs
FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE POLICY "Tenant reads own cleanup logs" ON public.admin_cleanup_logs
FOR SELECT TO authenticated
USING (admin_id IS NOT NULL AND admin_id IN (public.get_my_admin_id(), public.get_my_profile_id()));

-- 4. Usage calculator
CREATE OR REPLACE FUNCTION public.calc_admin_storage_usage(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db bigint := 0;
  v_files bigint := 0;
  v_val bigint;
  v_tbl text;
  v_break jsonb := '{}'::jsonb;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin id required';
  END IF;

  IF NOT (public.is_super_admin()
          OR p_admin_id = public.get_my_admin_id()
          OR p_admin_id = public.get_my_profile_id()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR v_tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'admin_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT COALESCE(SUM(pg_column_size(t.*)),0)::bigint FROM public.%I t WHERE t.admin_id = $1', v_tbl)
      INTO v_val USING p_admin_id;
    IF v_val > 0 THEN
      v_break := v_break || jsonb_build_object(v_tbl, v_val);
    END IF;
    v_db := v_db + v_val;
  END LOOP;

  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0)
    INTO v_files
  FROM storage.objects o
  WHERE o.name LIKE p_admin_id::text || '/%';

  INSERT INTO public.admin_storage_usage (admin_id, db_bytes, file_bytes, breakdown, computed_at)
  VALUES (p_admin_id, v_db, v_files, v_break, now())
  ON CONFLICT (admin_id) DO UPDATE
    SET db_bytes = EXCLUDED.db_bytes,
        file_bytes = EXCLUDED.file_bytes,
        breakdown = EXCLUDED.breakdown,
        computed_at = EXCLUDED.computed_at,
        updated_at = now();

  RETURN jsonb_build_object(
    'admin_id', p_admin_id,
    'db_bytes', v_db,
    'file_bytes', v_files,
    'breakdown', v_break,
    'computed_at', now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.calc_admin_storage_usage(uuid) TO authenticated;

-- 5. Quota check helper (for storage uploads / UI gating)
CREATE OR REPLACE FUNCTION public.check_admin_storage_allowance(p_admin_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'db_quota_mb', q.db_quota_mb,
    'file_quota_mb', q.file_quota_mb,
    'cleanup_permission', COALESCE(q.cleanup_permission, false),
    'db_bytes', COALESCE(u.db_bytes, 0),
    'file_bytes', COALESCE(u.file_bytes, 0),
    'db_blocked', (q.db_quota_mb IS NOT NULL AND COALESCE(u.db_bytes,0) >= q.db_quota_mb * 1048576),
    'file_blocked', (q.file_quota_mb IS NOT NULL AND COALESCE(u.file_bytes,0) >= q.file_quota_mb * 1048576)
  )
  FROM (SELECT p_admin_id AS admin_id) base
  LEFT JOIN public.admin_storage_quotas q ON q.admin_id = base.admin_id
  LEFT JOIN public.admin_storage_usage u ON u.admin_id = base.admin_id;
$$;
GRANT EXECUTE ON FUNCTION public.check_admin_storage_allowance(uuid) TO authenticated;

-- 6. Enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_admin_storage_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_quota numeric;
  v_used bigint;
BEGIN
  v_admin := NULLIF(to_jsonb(NEW)->>'admin_id', '')::uuid;
  IF v_admin IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT db_quota_mb INTO v_quota FROM public.admin_storage_quotas WHERE admin_id = v_admin;
  IF v_quota IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT db_bytes INTO v_used FROM public.admin_storage_usage WHERE admin_id = v_admin;
  IF COALESCE(v_used, 0) >= v_quota * 1048576 THEN
    RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED: cloud database limit of % MB reached. Delete old data or ask support to increase the limit.', v_quota;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quota_bills BEFORE INSERT ON public.bills FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_items BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_remote_orders BEFORE INSERT ON public.remote_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_table_orders BEFORE INSERT ON public.table_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();
CREATE TRIGGER trg_quota_purchases BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_storage_quota();

-- 7. Admin-only old data purge
CREATE OR REPLACE FUNCTION public.admin_purge_old_data(p_before_date date, p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_allowed boolean;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
BEGIN
  IF upper(COALESCE(p_confirm, '')) <> 'DELETE' THEN
    RAISE EXCEPTION 'Confirmation text mismatch';
  END IF;
  IF p_before_date IS NULL OR p_before_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid cutoff date';
  END IF;

  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only the account owner (admin) can delete old data';
  END IF;

  v_admin := public.get_my_profile_id();
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT cleanup_permission INTO v_allowed FROM public.admin_storage_quotas WHERE admin_id = v_admin;
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Data cleanup permission not granted. Please contact support.';
  END IF;

  DELETE FROM public.bill_items bi
  USING public.bills b
  WHERE bi.bill_id = b.id AND b.admin_id = v_admin AND b.created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bill_items', v_n);

  DELETE FROM public.bills WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bills', v_n);

  DELETE FROM public.remote_orders WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('remote_orders', v_n);

  DELETE FROM public.table_orders WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('table_orders', v_n);

  DELETE FROM public.feedback_submissions WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('feedback_submissions', v_n);

  DELETE FROM public.stock_ledger WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('stock_ledger', v_n);

  DELETE FROM public.rum_events WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rum_events', v_n);

  DELETE FROM public.ai_insights_log WHERE admin_id = v_admin AND created_at < p_before_date;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ai_insights_log', v_n);

  INSERT INTO public.admin_cleanup_logs (admin_id, performed_by, before_date, deleted_counts)
  VALUES (v_admin, auth.uid(), p_before_date, v_counts);

  PERFORM public.calc_admin_storage_usage(v_admin);

  RETURN jsonb_build_object('success', true, 'deleted', v_counts);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_purge_old_data(date, text) TO authenticated;