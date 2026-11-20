CREATE OR REPLACE FUNCTION public.calc_admin_storage_usage(p_admin_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_db bigint := 0; v_files bigint := 0; v_break jsonb := '{}'::jsonb; r record;
BEGIN
  IF p_admin_id IS NULL THEN RAISE EXCEPTION 'admin id required'; END IF;
  IF NOT (public.is_super_admin() OR p_admin_id = public.get_my_admin_id() OR p_admin_id = public.get_my_profile_id()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- Fixed, static table list: no SQL is assembled at run time.
  FOR r IN
    SELECT 'additional_charges' n, sum(pg_column_size(t.*)) s FROM public.additional_charges t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'admin_cleanup_logs', sum(pg_column_size(t.*)) FROM public.admin_cleanup_logs t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'admin_storage_alerts', sum(pg_column_size(t.*)) FROM public.admin_storage_alerts t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'admin_storage_quotas', sum(pg_column_size(t.*)) FROM public.admin_storage_quotas t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'admin_storage_usage', sum(pg_column_size(t.*)) FROM public.admin_storage_usage t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'aggregator_integrations', sum(pg_column_size(t.*)) FROM public.aggregator_integrations t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'ai_insights_log', sum(pg_column_size(t.*)) FROM public.ai_insights_log t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'ai_usage_limits', sum(pg_column_size(t.*)) FROM public.ai_usage_limits t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'anti_theft_alerts', sum(pg_column_size(t.*)) FROM public.anti_theft_alerts t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'appointments', sum(pg_column_size(t.*)) FROM public.appointments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'bills', sum(pg_column_size(t.*)) FROM public.bills t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'bills_archive', sum(pg_column_size(t.*)) FROM public.bills_archive t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'blocked_devices', sum(pg_column_size(t.*)) FROM public.blocked_devices t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'branches', sum(pg_column_size(t.*)) FROM public.branches t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'brands', sum(pg_column_size(t.*)) FROM public.brands t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'client_webhook_endpoints', sum(pg_column_size(t.*)) FROM public.client_webhook_endpoints t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'client_webhook_logs', sum(pg_column_size(t.*)) FROM public.client_webhook_logs t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'counter_connections', sum(pg_column_size(t.*)) FROM public.counter_connections t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'customer_ledger', sum(pg_column_size(t.*)) FROM public.customer_ledger t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'customers', sum(pg_column_size(t.*)) FROM public.customers t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'departments', sum(pg_column_size(t.*)) FROM public.departments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'expense_budgets', sum(pg_column_size(t.*)) FROM public.expense_budgets t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'expense_categories', sum(pg_column_size(t.*)) FROM public.expense_categories t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'expenses', sum(pg_column_size(t.*)) FROM public.expenses t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'feedback_form_fields', sum(pg_column_size(t.*)) FROM public.feedback_form_fields t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'feedback_forms', sum(pg_column_size(t.*)) FROM public.feedback_forms t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'feedback_submissions', sum(pg_column_size(t.*)) FROM public.feedback_submissions t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'happy_hours', sum(pg_column_size(t.*)) FROM public.happy_hours t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'ingredients', sum(pg_column_size(t.*)) FROM public.ingredients t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'item_batches', sum(pg_column_size(t.*)) FROM public.item_batches t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'item_categories', sum(pg_column_size(t.*)) FROM public.item_categories t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'items', sum(pg_column_size(t.*)) FROM public.items t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'khata_transactions', sum(pg_column_size(t.*)) FROM public.khata_transactions t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'loyalty_transactions', sum(pg_column_size(t.*)) FROM public.loyalty_transactions t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'online_orders', sum(pg_column_size(t.*)) FROM public.online_orders t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'payment_gateway_credentials', sum(pg_column_size(t.*)) FROM public.payment_gateway_credentials t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'payment_mandates', sum(pg_column_size(t.*)) FROM public.payment_mandates t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'payment_transactions', sum(pg_column_size(t.*)) FROM public.payment_transactions t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'payment_webhook_events', sum(pg_column_size(t.*)) FROM public.payment_webhook_events t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'payments', sum(pg_column_size(t.*)) FROM public.payments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'profiles', sum(pg_column_size(t.*)) FROM public.profiles t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'promo_banners', sum(pg_column_size(t.*)) FROM public.promo_banners t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'providers', sum(pg_column_size(t.*)) FROM public.providers t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'public_rate_limits', sum(pg_column_size(t.*)) FROM public.public_rate_limits t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchase_distributions', sum(pg_column_size(t.*)) FROM public.purchase_distributions t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchase_items', sum(pg_column_size(t.*)) FROM public.purchase_items t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchase_payments', sum(pg_column_size(t.*)) FROM public.purchase_payments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchase_return_items', sum(pg_column_size(t.*)) FROM public.purchase_return_items t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchase_returns', sum(pg_column_size(t.*)) FROM public.purchase_returns t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'purchases', sum(pg_column_size(t.*)) FROM public.purchases t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'recipes', sum(pg_column_size(t.*)) FROM public.recipes t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'remote_orders', sum(pg_column_size(t.*)) FROM public.remote_orders t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'rum_events', sum(pg_column_size(t.*)) FROM public.rum_events t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'security_audit_log', sum(pg_column_size(t.*)) FROM public.security_audit_log t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'shift_audit_log', sum(pg_column_size(t.*)) FROM public.shift_audit_log t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'shift_reconciliations', sum(pg_column_size(t.*)) FROM public.shift_reconciliations t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'shifts', sum(pg_column_size(t.*)) FROM public.shifts t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'stock_adjustments', sum(pg_column_size(t.*)) FROM public.stock_adjustments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'stock_ledger', sum(pg_column_size(t.*)) FROM public.stock_ledger t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'stock_transfer_items', sum(pg_column_size(t.*)) FROM public.stock_transfer_items t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'stock_transfers', sum(pg_column_size(t.*)) FROM public.stock_transfers t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'subscription_pack_pricing', sum(pg_column_size(t.*)) FROM public.subscription_pack_pricing t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'subscription_payments', sum(pg_column_size(t.*)) FROM public.subscription_payments t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'suppliers', sum(pg_column_size(t.*)) FROM public.suppliers t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'table_orders', sum(pg_column_size(t.*)) FROM public.table_orders t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'table_reservations', sum(pg_column_size(t.*)) FROM public.table_reservations t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'table_service_requests', sum(pg_column_size(t.*)) FROM public.table_service_requests t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'tables', sum(pg_column_size(t.*)) FROM public.tables t WHERE admin_id=p_admin_id
    UNION ALL SELECT 'tax_rates', sum(pg_column_size(t.*)) FROM public.tax_rates t WHERE admin_id=p_admin_id
  LOOP
    IF coalesce(r.s,0) > 0 THEN v_break := v_break || jsonb_build_object(r.n, r.s); v_db := v_db + r.s; END IF;
  END LOOP;
  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0) INTO v_files FROM storage.objects o WHERE o.name LIKE p_admin_id::text || '/%';
  INSERT INTO public.admin_storage_usage (admin_id, db_bytes, file_bytes, breakdown, computed_at)
  VALUES (p_admin_id, v_db, v_files, v_break, now())
  ON CONFLICT (admin_id) DO UPDATE SET db_bytes=EXCLUDED.db_bytes, file_bytes=EXCLUDED.file_bytes, breakdown=EXCLUDED.breakdown, computed_at=EXCLUDED.computed_at, updated_at=now();
  RETURN jsonb_build_object('admin_id', p_admin_id, 'db_bytes', v_db, 'file_bytes', v_files, 'breakdown', v_break, 'computed_at', now());
END;
$function$;
REVOKE ALL ON FUNCTION public.calc_admin_storage_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_admin_storage_usage(uuid) TO authenticated, service_role;

CREATE POLICY purchase_returns_history_pin_guard ON public.purchase_returns AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_purchase_history(admin_id));
CREATE POLICY purchase_return_items_history_pin_guard ON public.purchase_return_items AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_purchase_history(admin_id));

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_on_bill_items()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.bills b JOIN public.profiles p ON p.id=b.admin_id WHERE b.id=NEW.bill_id AND (
      p.status IN ('paused','deleted')
      OR lower(coalesce(p.subscription_status,'active')) IN ('expired','cancelled','canceled','suspended','inactive')
      OR (p.subscription_end_date IS NOT NULL AND p.subscription_end_date < now()))) THEN
    RAISE EXCEPTION 'Subscription inactive. Please renew to continue billing.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_active_subscription_on_bill_items() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_active_subscription_on_bill_items ON public.bill_items;
CREATE TRIGGER trg_enforce_active_subscription_on_bill_items BEFORE INSERT ON public.bill_items FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_on_bill_items();