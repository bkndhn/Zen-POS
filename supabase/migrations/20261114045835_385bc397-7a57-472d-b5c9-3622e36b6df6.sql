CREATE OR REPLACE FUNCTION public.prepare_bill_archive_month(p_month date) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_start date := date_trunc('month',p_month)::date; v_end date; v_name text;
BEGIN
 IF p_month IS NULL THEN RAISE EXCEPTION 'Month is required'; END IF;
 v_end := (v_start+interval '1 month')::date;
 PERFORM pg_advisory_xact_lock(hashtext('prepare_bill_archive_month'));
 FOREACH v_name IN ARRAY ARRAY['bills_archive_'||to_char(v_start,'YYYYMM'),'bill_items_archive_'||to_char(v_start,'YYYYMM')] LOOP
 IF v_name LIKE 'bills_archive_%' THEN
 EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.bills_archive FOR VALUES FROM (%L) TO (%L)',v_name,v_start,v_end);
 ELSE
 EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.bill_items_archive FOR VALUES FROM (%L) TO (%L)',v_name,v_start,v_end);
 END IF;
 EXECUTE format('GRANT ALL ON public.%I TO service_role',v_name);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v_name);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_name);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_name AND policyname='deny_direct_client_access') THEN
 EXECUTE format('CREATE POLICY deny_direct_client_access ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',v_name);
 END IF;
 END LOOP;
END $$;
DO $$ DECLARE m date; BEGIN FOR m IN SELECT generate_series(date_trunc('month',current_date)-interval '12 months',date_trunc('month',current_date)+interval '2 months',interval '1 month')::date LOOP PERFORM public.prepare_bill_archive_month(m); END LOOP; END $$;