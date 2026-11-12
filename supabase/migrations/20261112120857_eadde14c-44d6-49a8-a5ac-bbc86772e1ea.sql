-- 1. Stock adjustment: require branch write access
CREATE OR REPLACE FUNCTION public.apply_stock_adjustment(p_item_id uuid, p_branch_id uuid, p_change_qty numeric, p_reason text, p_notes text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.get_user_admin_id();
  v_item_admin uuid; v_new_stock numeric; v_adj_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF NOT public.has_branch_write_access(v_admin_id, p_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for this branch';
  END IF;
  SELECT admin_id INTO v_item_admin FROM public.items WHERE id = p_item_id AND branch_id = p_branch_id;
  IF v_item_admin IS NULL OR v_item_admin <> v_admin_id THEN RAISE EXCEPTION 'Item not found in branch'; END IF;
  UPDATE public.items SET stock_quantity = COALESCE(stock_quantity,0) + p_change_qty
    WHERE id = p_item_id RETURNING stock_quantity INTO v_new_stock;
  INSERT INTO public.stock_adjustments(admin_id, branch_id, item_id, change_qty, reason, notes, created_by)
    VALUES (v_admin_id, p_branch_id, p_item_id, p_change_qty, COALESCE(p_reason,'other'), p_notes, auth.uid())
    RETURNING id INTO v_adj_id;
  INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, notes, created_by)
    VALUES (v_admin_id, p_branch_id, p_item_id, p_change_qty, v_new_stock, 'adjustment', v_adj_id, COALESCE(p_reason,'other'), p_notes, auth.uid());
  RETURN jsonb_build_object('new_stock', v_new_stock);
END;
$function$;

-- 2. Active order lookup: return only minimal non-personal fields
CREATE OR REPLACE FUNCTION public.get_active_remote_order_for_device(p_admin_id uuid, p_branch_id uuid, p_device_id text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status)
  FROM public.remote_orders o
  WHERE p_device_id IS NOT NULL AND length(p_device_id) >= 32
    AND o.device_id = p_device_id
    AND o.admin_id = p_admin_id
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND COALESCE(o.status, 'pending') NOT IN ('completed', 'cancelled', 'no_show')
  ORDER BY o.created_at DESC
  LIMIT 1;
$function$;

-- 3/4. Tenant checks for supplier & purchase references
CREATE OR REPLACE FUNCTION public.guard_purchase_tenant_refs()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.admin_id = NEW.admin_id) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  IF TG_TABLE_NAME = 'purchase_returns' AND NEW.purchase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchases p WHERE p.id = NEW.purchase_id AND p.admin_id = NEW.admin_id) THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_purchase_tenant_refs ON public.purchases;
CREATE TRIGGER trg_guard_purchase_tenant_refs BEFORE INSERT OR UPDATE OF supplier_id ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_tenant_refs();
DROP TRIGGER IF EXISTS trg_guard_purchase_tenant_refs ON public.purchase_returns;
CREATE TRIGGER trg_guard_purchase_tenant_refs BEFORE INSERT OR UPDATE OF supplier_id, purchase_id ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_tenant_refs();

-- 5. Block new bills when the tenant's subscription has ended
CREATE OR REPLACE FUNCTION public.enforce_active_subscription_on_bill()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.admin_id AND (
      p.status IN ('paused','deleted')
      OR lower(coalesce(p.subscription_status,'active')) IN ('expired','cancelled','canceled','suspended','inactive')
      OR (p.subscription_end_date IS NOT NULL AND p.subscription_end_date < now())
    )) THEN
    RAISE EXCEPTION 'Subscription inactive. Please renew to continue billing.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_enforce_active_subscription_on_bill ON public.bills;
CREATE TRIGGER trg_enforce_active_subscription_on_bill BEFORE INSERT ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_on_bill();

-- 6. Expenses: same Reports PIN gate as bills
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
USING (has_branch_read_access(admin_id, branch_id) AND (
  created_by = auth.uid() OR created_at >= now() - interval '2 days' OR can_read_report_bills(admin_id, branch_id)));