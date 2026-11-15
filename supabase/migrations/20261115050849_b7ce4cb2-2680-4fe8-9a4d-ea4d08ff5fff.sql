CREATE TABLE private.bill_archive_gate (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), history_verified boolean NOT NULL DEFAULT false, replay_verified boolean NOT NULL DEFAULT false, edits_verified boolean NOT NULL DEFAULT false, restore_verified boolean NOT NULL DEFAULT false, signed_in_verified boolean NOT NULL DEFAULT false);
REVOKE ALL ON private.bill_archive_gate FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private.bill_archive_gate TO service_role;
INSERT INTO private.bill_archive_gate(singleton) VALUES(true);
CREATE OR REPLACE FUNCTION public.archive_closed_bills(p_limit integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,private SET lock_timeout='1s' SET statement_timeout='15s' AS $$
DECLARE b public.bills%ROWTYPE; v_moved integer:=0; v_lines bigint; v_deleted bigint; v_cols text; v_item_cols text;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'Batch size must be between 1 and 100'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.bill_archive_gate WHERE singleton AND history_verified AND replay_verified AND edits_verified AND restore_verified AND signed_in_verified) THEN RETURN jsonb_build_object('status','blocked','moved',0,'reason','History, replay, edit, restore and signed-in verification required'); END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('archive_closed_bills')) THEN RETURN jsonb_build_object('status','busy','moved',0); END IF;
 IF EXISTS(SELECT 1 FROM public.bills WHERE created_at>now()-interval '10 minutes') THEN RETURN jsonb_build_object('status','billing_active','moved',0); END IF;
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO v_cols FROM pg_attribute WHERE attrelid='public.bills'::regclass AND attnum>0 AND NOT attisdropped;
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO v_item_cols FROM pg_attribute WHERE attrelid='public.bill_items'::regclass AND attnum>0 AND NOT attisdropped;
 FOR b IN SELECT x.* FROM public.bills x WHERE x.date<current_date-60 AND public.bill_archive_eligible(x.date,x.payment_status,x.due_amount,x.kitchen_status,x.service_status,current_date) AND x.admin_id IS NOT NULL AND NOT coalesce(x.is_deleted,false)
 AND NOT EXISTS(SELECT 1 FROM public.tables t WHERE t.current_bill_id=x.id)
 AND NOT EXISTS(SELECT 1 FROM public.table_orders t WHERE t.bill_id=x.id)
 AND NOT EXISTS(SELECT 1 FROM public.anti_theft_alerts t WHERE t.bill_id=x.id)
 AND NOT EXISTS(SELECT 1 FROM public.customer_ledger t WHERE t.bill_id=x.id)
 AND NOT EXISTS(SELECT 1 FROM public.khata_transactions t WHERE t.bill_id=x.id)
 ORDER BY x.date,x.id LIMIT p_limit FOR UPDATE OF x SKIP LOCKED LOOP
 PERFORM public.prepare_bill_archive_month(b.date);
 PERFORM 1 FROM public.bill_items i WHERE i.bill_id=b.id FOR UPDATE;
 SELECT count(*) INTO v_lines FROM public.bill_items WHERE bill_id=b.id;
 IF EXISTS(SELECT 1 FROM public.bills_archive a WHERE a.id=b.id) OR EXISTS(SELECT 1 FROM public.bill_items_archive a JOIN public.bill_items i ON i.id=a.id WHERE i.bill_id=b.id) THEN RAISE EXCEPTION 'Archive overlap; entire batch rolled back'; END IF;
 EXECUTE format('INSERT INTO public.bills_archive (%s) SELECT %s FROM public.bills WHERE id=$1',v_cols,v_cols) USING b.id;
 EXECUTE format('INSERT INTO public.bill_items_archive (%s,bill_date) SELECT %s,$2 FROM public.bill_items WHERE bill_id=$1',v_item_cols,v_item_cols) USING b.id,b.date;
 IF NOT EXISTS(SELECT 1 FROM public.bills_archive a WHERE a.id=b.id AND a.date=b.date AND (to_jsonb(a)-'archived_at'-'archive_updated_at')=to_jsonb(b)) THEN RAISE EXCEPTION 'Bill copy mismatch; entire batch rolled back'; END IF;
 IF (SELECT count(*) FROM public.bill_items_archive WHERE bill_id=b.id AND bill_date=b.date)<>v_lines OR EXISTS(SELECT 1 FROM public.bill_items i LEFT JOIN public.bill_items_archive a ON a.id=i.id AND a.bill_date=b.date WHERE i.bill_id=b.id AND (a.id IS NULL OR (to_jsonb(a)-'bill_date'-'archived_at'-'archive_updated_at') IS DISTINCT FROM to_jsonb(i))) THEN RAISE EXCEPTION 'Item copy mismatch; entire batch rolled back'; END IF;
 DELETE FROM public.bill_items WHERE bill_id=b.id;
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 IF v_deleted<>v_lines THEN RAISE EXCEPTION 'Item removal mismatch; entire batch rolled back'; END IF;
 DELETE FROM public.bills WHERE id=b.id;
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 IF v_deleted<>1 THEN RAISE EXCEPTION 'Bill removal mismatch; entire batch rolled back'; END IF;
 v_moved:=v_moved+1;
 END LOOP;
 RETURN jsonb_build_object('status','complete','moved',v_moved);
END $$;
REVOKE ALL ON FUNCTION public.archive_closed_bills(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.archive_closed_bills(integer) TO service_role;
DO $$ DECLARE result jsonb; BEGIN result:=public.archive_closed_bills(100); IF result->>'status'<>'blocked' OR (result->>'moved')::integer<>0 THEN RAISE EXCEPTION 'Archive gate failed'; END IF; END $$;