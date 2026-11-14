CREATE TABLE public.bills_archive (LIKE public.bills INCLUDING DEFAULTS, archived_at timestamptz NOT NULL DEFAULT now(), archive_updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(date,id)) PARTITION BY RANGE(date);
GRANT SELECT ON public.bills_archive TO authenticated;
GRANT ALL ON public.bills_archive TO service_role;
ALTER TABLE public.bills_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_bills_read ON public.bills_archive FOR SELECT TO authenticated USING (NOT public.is_super_admin() AND public.has_branch_read_access(admin_id,branch_id) AND (created_by=auth.uid() OR created_at >= now()-interval '2 days' OR public.can_read_report_bills(admin_id,branch_id)));

CREATE TABLE public.bill_items_archive (LIKE public.bill_items INCLUDING DEFAULTS, bill_date date NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(), archive_updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(bill_date,id), FOREIGN KEY(bill_date,bill_id) REFERENCES public.bills_archive(date,id)) PARTITION BY RANGE(bill_date);
GRANT SELECT ON public.bill_items_archive TO authenticated;
GRANT ALL ON public.bill_items_archive TO service_role;
ALTER TABLE public.bill_items_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_items_read ON public.bill_items_archive FOR SELECT TO authenticated USING (NOT public.is_super_admin() AND EXISTS (SELECT 1 FROM public.bills_archive b WHERE b.id=bill_items_archive.bill_id AND b.date=bill_items_archive.bill_date));

CREATE INDEX bills_archive_tenant_date ON public.bills_archive(admin_id,branch_id,date);
CREATE INDEX bills_archive_id ON public.bills_archive(id);
CREATE INDEX bill_items_archive_bill ON public.bill_items_archive(bill_date,bill_id);

CREATE FUNCTION public.stamp_archive_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.archive_updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER stamp_bills_archive BEFORE UPDATE ON public.bills_archive FOR EACH ROW EXECUTE FUNCTION public.stamp_archive_updated_at();
CREATE TRIGGER stamp_items_archive BEFORE UPDATE ON public.bill_items_archive FOR EACH ROW EXECUTE FUNCTION public.stamp_archive_updated_at();

CREATE FUNCTION public.prepare_bill_archive_month(p_month date) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_start date := date_trunc('month',p_month)::date; v_end date; v_name text;
BEGIN
 IF p_month IS NULL THEN RAISE EXCEPTION 'Month is required'; END IF;
 v_end := (v_start+interval '1 month')::date;
 PERFORM pg_advisory_xact_lock(hashtext('prepare_bill_archive_month'));
 v_name := 'bills_archive_'||to_char(v_start,'YYYYMM');
 EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.bills_archive FOR VALUES FROM (%L) TO (%L)',v_name,v_start,v_end);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',v_name);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_name);
 v_name := 'bill_items_archive_'||to_char(v_start,'YYYYMM');
 EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.bill_items_archive FOR VALUES FROM (%L) TO (%L)',v_name,v_start,v_end);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',v_name);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_name);
END $$;
REVOKE ALL ON FUNCTION public.prepare_bill_archive_month(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_bill_archive_month(date) TO service_role;
DO $$ DECLARE m date; BEGIN FOR m IN SELECT generate_series(date_trunc('month',current_date)-interval '12 months',date_trunc('month',current_date)+interval '2 months',interval '1 month')::date LOOP PERFORM public.prepare_bill_archive_month(m); END LOOP; END $$;

CREATE FUNCTION public.bill_archive_eligible(p_date date,p_payment_status text,p_due numeric,p_kitchen_status text,p_service_status text,p_today date) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(p_date < p_today-60 AND p_payment_status='paid' AND p_due=0 AND p_kitchen_status='completed' AND p_service_status='completed',false)
$$;
REVOKE ALL ON FUNCTION public.bill_archive_eligible(date,text,numeric,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_archive_eligible(date,text,numeric,text,text,date) TO service_role;

CREATE FUNCTION public.preview_bill_archive(p_month date) RETURNS TABLE(month_start date,old_bills bigint,settled_completed bigint,linked_blockers bigint,eligible_unlinked bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH candidates AS (
 SELECT b.id, public.bill_archive_eligible(b.date,b.payment_status,b.due_amount,b.kitchen_status,b.service_status,current_date) AS eligible,
 (EXISTS(SELECT 1 FROM public.tables t WHERE t.current_bill_id=b.id)
 OR EXISTS(SELECT 1 FROM public.table_orders t WHERE t.bill_id=b.id)
 OR EXISTS(SELECT 1 FROM public.anti_theft_alerts a WHERE a.bill_id=b.id)
 OR EXISTS(SELECT 1 FROM public.customer_ledger l WHERE l.bill_id=b.id)
 OR EXISTS(SELECT 1 FROM public.khata_transactions k WHERE k.bill_id=b.id)) AS linked
 FROM public.bills b WHERE b.date>=date_trunc('month',p_month)::date AND b.date<(date_trunc('month',p_month)+interval '1 month')::date AND b.date<current_date-60
 ) SELECT date_trunc('month',p_month)::date,count(*),count(*) FILTER(WHERE eligible),count(*) FILTER(WHERE eligible AND linked),count(*) FILTER(WHERE eligible AND NOT linked) FROM candidates
$$;
REVOKE ALL ON FUNCTION public.preview_bill_archive(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_bill_archive(date) TO service_role;
COMMENT ON TABLE public.bills_archive IS 'Preparation only: no mover or cron enabled. Do not delete live bills until historical readers, references, edits and offline replay are migrated and verified.';