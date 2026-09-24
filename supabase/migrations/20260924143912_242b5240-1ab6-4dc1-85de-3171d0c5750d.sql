ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS antitheft_kot_item_delete BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_cash_drawer BOOLEAN DEFAULT true;

CREATE OR REPLACE FUNCTION public.report_antitheft_event(
  p_alert_type text, p_branch_id uuid DEFAULT NULL, p_bill_id uuid DEFAULT NULL,
  p_bill_no text DEFAULT NULL, p_amount numeric DEFAULT 0, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid; v_owner uuid; v_name text; v_s record; v_title text; v_body text; v_items text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_alert_type NOT IN ('item_removed_after_kot','cash_drawer_manual') THEN RAISE EXCEPTION 'invalid alert type'; END IF;
  SELECT COALESCE(admin_id, id), name INTO v_admin, v_name FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_admin IS NULL THEN RETURN; END IF;
  IF p_bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND admin_id = v_admin) THEN
    RAISE EXCEPTION 'bill not in your shop';
  END IF;
  SELECT user_id INTO v_owner FROM profiles WHERE id = v_admin;
  SELECT * INTO v_s FROM shop_settings WHERE user_id = v_owner AND branch_id = p_branch_id LIMIT 1;
  IF v_s IS NULL THEN SELECT * INTO v_s FROM shop_settings WHERE user_id = v_owner LIMIT 1; END IF;
  v_name := COALESCE(v_name, 'Staff');
  IF p_alert_type = 'item_removed_after_kot' THEN
    IF NOT COALESCE(v_s.antitheft_kot_item_delete, true) THEN RETURN; END IF;
    v_items := LEFT(COALESCE(p_details->>'items', 'items'), 120);
    v_title := 'Item Removed After KOT';
    v_body := v_items || ' (Rs.' || ROUND(COALESCE(p_amount,0)) || ') removed from Bill #' || COALESCE(p_bill_no,'-') || ' by ' || v_name;
  ELSE
    IF NOT COALESCE(v_s.antitheft_cash_drawer, true) THEN RETURN; END IF;
    v_title := 'Cash Drawer Opened (No Sale)';
    v_body := 'Drawer opened manually by ' || v_name || ' at ' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata','hh12:MI AM');
  END IF;
  PERFORM public.fire_antitheft_alert(v_admin, p_branch_id, p_alert_type,
    CASE WHEN p_alert_type = 'item_removed_after_kot' THEN 'high' ELSE 'medium' END,
    p_bill_id, p_bill_no, COALESCE(p_amount,0), v_name, auth.uid(), v_title, v_body, COALESCE(p_details,'{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.report_antitheft_event(text,uuid,uuid,text,numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_antitheft_event(text,uuid,uuid,text,numeric,jsonb) TO authenticated;