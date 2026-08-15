CREATE OR REPLACE FUNCTION public.calc_admin_branch_storage(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tbl text;
  v_rows jsonb;
  v_totals jsonb := '{}'::jsonb;
  r record;
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
    JOIN information_schema.columns b
      ON b.table_schema = c.table_schema AND b.table_name = c.table_name AND b.column_name = 'branch_id'
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'admin_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT COALESCE(jsonb_object_agg(k, v), ''{}''::jsonb) FROM (
         SELECT COALESCE(t.branch_id::text, ''unassigned'') AS k, COALESCE(SUM(pg_column_size(t.*)),0)::bigint AS v
         FROM public.%I t WHERE t.admin_id = $1 GROUP BY 1
       ) s', v_tbl)
      INTO v_rows USING p_admin_id;

    FOR r IN SELECT key, value FROM jsonb_each(v_rows) LOOP
      v_totals := v_totals || jsonb_build_object(
        r.key,
        COALESCE((v_totals->>r.key)::bigint, 0) + (r.value)::text::bigint
      );
    END LOOP;
  END LOOP;

  RETURN v_totals;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_admin_branch_storage(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.calc_admin_branch_storage(uuid) TO authenticated;