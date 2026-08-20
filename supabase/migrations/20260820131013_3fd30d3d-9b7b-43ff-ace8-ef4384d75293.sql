CREATE OR REPLACE FUNCTION public.void_purchase_transaction(p_purchase_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.get_user_admin_id();
  v_user uuid := auth.uid();
  v_purchase public.purchases%ROWTYPE;
  v_dist RECORD;
  v_new_stock numeric;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT * INTO v_purchase FROM public.purchases
    WHERE id = p_purchase_id AND admin_id = v_admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF COALESCE(v_purchase.status,'active') = 'void' THEN
    RAISE EXCEPTION 'Purchase already voided';
  END IF;

  FOR v_dist IN
    SELECT pd.item_id, pd.branch_id, pd.quantity
    FROM public.purchase_distributions pd
    JOIN public.purchase_items pi ON pi.id = pd.purchase_item_id
    WHERE pi.purchase_id = p_purchase_id AND pd.admin_id = v_admin_id
  LOOP
    IF v_dist.item_id IS NOT NULL THEN
      UPDATE public.items
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - COALESCE(v_dist.quantity,0))
        WHERE id = v_dist.item_id AND admin_id = v_admin_id AND branch_id = v_dist.branch_id
        RETURNING stock_quantity INTO v_new_stock;

      IF v_new_stock IS NOT NULL THEN
        INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
          VALUES (v_admin_id, v_dist.branch_id, v_dist.item_id, -COALESCE(v_dist.quantity,0), v_new_stock,
                  'purchase_void', p_purchase_id,
                  COALESCE('VOID ' || v_purchase.purchase_no, 'VOID') || COALESCE(' - ' || p_reason, ''), v_user);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.purchases
    SET status = 'void',
        notes = COALESCE(notes,'') || E'\n[VOIDED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ']' || COALESCE(' ' || p_reason, ''),
        updated_at = now()
    WHERE id = p_purchase_id AND admin_id = v_admin_id;

  RETURN jsonb_build_object('id', p_purchase_id, 'status', 'void');
END;
$function$;

REVOKE ALL ON FUNCTION public.void_purchase_transaction(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.void_purchase_transaction(uuid, text) TO authenticated;