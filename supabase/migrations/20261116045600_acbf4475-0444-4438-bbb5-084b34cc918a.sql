CREATE OR REPLACE VIEW public.bills_history WITH (security_invoker = true) AS
SELECT id,bill_no,admin_id,created_by,date,total_amount,discount,payment_mode,payment_details,additional_charges,is_edited,is_deleted,kitchen_status,service_status,status_updated_at,created_at,customer_mobile,whatsapp_sent,whatsapp_sent_at,table_no,customer_phone,customer_gstin,tax_summary,total_tax,round_off,branch_id,order_type,channel,billing_type,doctor_name,prescription_image_url,provider_id,due_amount,paid_amount,payment_status,eta_minutes,eta_updated_at,false AS is_archived FROM public.bills
UNION ALL
SELECT id,bill_no,admin_id,created_by,date,total_amount,discount,payment_mode,payment_details,additional_charges,is_edited,is_deleted,kitchen_status,service_status,status_updated_at,created_at,customer_mobile,whatsapp_sent,whatsapp_sent_at,table_no,customer_phone,customer_gstin,tax_summary,total_tax,round_off,branch_id,order_type,channel,billing_type,doctor_name,prescription_image_url,provider_id,due_amount,paid_amount,payment_status,eta_minutes,eta_updated_at,true FROM public.bills_archive;
REVOKE ALL ON public.bills_history FROM anon;
GRANT SELECT ON public.bills_history TO authenticated;
GRANT SELECT ON public.bills_history TO service_role;

CREATE OR REPLACE FUNCTION public.get_bill_archive_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_admin uuid := public.get_my_admin_id(); r jsonb;
BEGIN
  IF v_admin IS NULL OR public.is_super_admin() THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'active', (SELECT count(*) FROM bills WHERE admin_id = v_admin),
    'archived', (SELECT count(*) FROM bills_archive WHERE admin_id = v_admin),
    'eligible_60d', (SELECT count(*) FROM bills WHERE admin_id = v_admin AND date < current_date - 60),
    'oldest_archived', (SELECT min(date) FROM bills_archive WHERE admin_id = v_admin),
    'pipeline_enabled', (SELECT coalesce(bool_and(history_verified AND edits_verified AND replay_verified AND restore_verified AND signed_in_verified), false) FROM private.bill_archive_gate),
    'scheduled', EXISTS (SELECT 1 FROM cron.job WHERE jobname ILIKE '%bill%archive%' AND active)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_bill_archive_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_bill_archive_status() TO authenticated;