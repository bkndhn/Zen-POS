-- 1) Sign-in limit reset: only the signed-in owner of the email can clear their own counter
CREATE OR REPLACE FUNCTION public.clear_auth_rate_limit(p_action text, p_identifier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := left(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), 160);
  v_id text := left(lower(trim(coalesce(p_identifier, ''))), 160);
BEGIN
  IF auth.uid() IS NULL OR v_email = '' OR v_id <> v_email THEN
    RETURN; -- silently ignore: callers may only clear their own counter
  END IF;
  DELETE FROM public.auth_rate_limits
  WHERE action = lower(trim(coalesce(p_action, '')))
    AND bucket_key = v_email;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_auth_rate_limit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_auth_rate_limit(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_auth_rate_limit(text, text) TO authenticated, service_role;

-- 2) Branch access: paused/deleted accounts (or sub-users of a paused/deleted shop) lose access immediately
CREATE OR REPLACE FUNCTION public.has_branch_read_access(target_admin_id uuid, target_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_parent_status text;
  v_my_admin_id uuid;
BEGIN
  SELECT p.role, p.status::text, a.status::text, CASE WHEN p.role = 'admin' THEN p.id ELSE p.admin_id END
    INTO v_role, v_status, v_parent_status, v_my_admin_id
  FROM public.profiles p
  LEFT JOIN public.profiles a ON a.id = p.admin_id
  WHERE p.user_id = auth.uid();

  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF v_role IS NULL THEN RETURN FALSE; END IF;

  -- Revoked accounts must not read anything
  IF coalesce(v_status, 'active') <> 'active' THEN RETURN FALSE; END IF;
  IF v_role = 'user' AND coalesce(v_parent_status, 'active') <> 'active' THEN RETURN FALSE; END IF;

  IF target_admin_id IS NULL OR v_my_admin_id IS NULL THEN RETURN FALSE; END IF;
  IF target_admin_id <> v_my_admin_id THEN RETURN FALSE; END IF;

  IF target_branch_id IS NULL THEN RETURN TRUE; END IF;
  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  IF v_role = 'user' THEN
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_branch_write_access(target_admin_id uuid, target_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_parent_status text;
  v_my_admin_id uuid;
BEGIN
  SELECT p.role, p.status::text, a.status::text, CASE WHEN p.role = 'admin' THEN p.id ELSE p.admin_id END
    INTO v_role, v_status, v_parent_status, v_my_admin_id
  FROM public.profiles p
  LEFT JOIN public.profiles a ON a.id = p.admin_id
  WHERE p.user_id = auth.uid();

  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF v_role IS NULL THEN RETURN FALSE; END IF;

  IF coalesce(v_status, 'active') <> 'active' THEN RETURN FALSE; END IF;
  IF v_role = 'user' AND coalesce(v_parent_status, 'active') <> 'active' THEN RETURN FALSE; END IF;

  IF target_admin_id IS NULL OR v_my_admin_id IS NULL THEN RETURN FALSE; END IF;
  IF target_admin_id <> v_my_admin_id THEN RETURN FALSE; END IF;

  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  IF v_role = 'user' THEN
    IF target_branch_id IS NULL THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$function$;

-- 3) Stock-changing procedures: enforce the same branch write rule the items table already uses
CREATE OR REPLACE FUNCTION public.create_stock_transfer(p_from_branch_id uuid, p_to_branch_id uuid, p_transfer_date date, p_notes text, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.get_user_admin_id();
  v_user uuid := auth.uid();
  v_transfer_id uuid;
  v_no text;
  v_seq int;
  v_line jsonb;
  v_qty numeric;
  v_from_item uuid;
  v_to_item uuid;
  v_item_name text;
  v_stock numeric;
  v_new_from numeric;
  v_new_to numeric;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_from_branch_id = p_to_branch_id THEN RAISE EXCEPTION 'Source and destination must differ'; END IF;
  IF NOT public.has_branch_write_access(v_admin, p_from_branch_id)
     OR NOT public.has_branch_write_access(v_admin, p_to_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for one of the selected branches';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_no FROM 5) AS INTEGER)),0)+1
    INTO v_seq FROM public.stock_transfers
    WHERE admin_id = v_admin AND transfer_no LIKE 'TRF-%';
  v_no := 'TRF-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO public.stock_transfers(admin_id, transfer_no, from_branch_id, to_branch_id, transfer_date, notes, created_by)
    VALUES (v_admin, v_no, p_from_branch_id, p_to_branch_id, COALESCE(p_transfer_date, CURRENT_DATE), p_notes, v_user)
    RETURNING id INTO v_transfer_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_from_item := (v_line->>'from_item_id')::uuid;
    v_to_item := (v_line->>'to_item_id')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_item_name := v_line->>'item_name';

    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(stock_quantity,0) INTO v_stock FROM public.items
      WHERE id = v_from_item AND admin_id = v_admin AND branch_id = p_from_branch_id;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'Source item not found: %', v_item_name; END IF;

    UPDATE public.items SET stock_quantity = COALESCE(stock_quantity,0) - v_qty
      WHERE id = v_from_item AND admin_id = v_admin AND branch_id = p_from_branch_id
      RETURNING stock_quantity INTO v_new_from;

    UPDATE public.items SET stock_quantity = COALESCE(stock_quantity,0) + v_qty
      WHERE id = v_to_item AND admin_id = v_admin AND branch_id = p_to_branch_id
      RETURNING stock_quantity INTO v_new_to;
    IF v_new_to IS NULL THEN RAISE EXCEPTION 'Destination item not found: %', v_item_name; END IF;

    INSERT INTO public.stock_transfer_items(transfer_id, admin_id, from_item_id, to_item_id, item_name, quantity)
      VALUES (v_transfer_id, v_admin, v_from_item, v_to_item, v_item_name, v_qty);

    INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
      VALUES (v_admin, p_from_branch_id, v_from_item, -v_qty, v_new_from, 'transfer_out', v_transfer_id, v_no, v_user);
    INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
      VALUES (v_admin, p_to_branch_id, v_to_item, v_qty, v_new_to, 'transfer_in', v_transfer_id, v_no, v_user);
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'transfer_no', v_no);
END $function$;

CREATE OR REPLACE FUNCTION public.create_purchase_transaction(p_supplier_id uuid, p_invoice_no text, p_purchase_date date, p_notes text, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.get_user_admin_id();
  v_user uuid := auth.uid();
  v_purchase_id uuid;
  v_purchase_no text;
  v_seq int;
  v_total numeric := 0;
  v_line jsonb;
  v_dist jsonb;
  v_line_id uuid;
  v_line_qty numeric;
  v_line_total numeric;
  v_dist_qty numeric;
  v_dist_item uuid;
  v_dist_branch uuid;
  v_new_stock numeric;
  v_batch_no text;
  v_expiry_date date;
  v_mfg_date date;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;

  -- Every branch that will receive stock must be one the caller can manage
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) l,
         jsonb_array_elements(COALESCE(l->'distributions','[]'::jsonb)) d
    WHERE NULLIF(d->>'branch_id','') IS NOT NULL
      AND NOT public.has_branch_write_access(v_admin_id, (d->>'branch_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'Not authorised for one of the selected branches';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(purchase_no FROM 5) AS INTEGER)),0)+1
    INTO v_seq FROM public.purchases
    WHERE admin_id = v_admin_id AND purchase_no LIKE 'PUR-%';
  v_purchase_no := 'PUR-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO public.purchases(admin_id, supplier_id, purchase_no, invoice_no, purchase_date, total_amount, notes, created_by)
    VALUES (v_admin_id, p_supplier_id, v_purchase_no, p_invoice_no, COALESCE(p_purchase_date, CURRENT_DATE), 0, p_notes, v_user)
    RETURNING id INTO v_purchase_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_line_total := v_line_qty * COALESCE((v_line->>'rate')::numeric, 0);
    v_total := v_total + v_line_total;
    v_batch_no := NULLIF(v_line->>'batch_no','');
    v_expiry_date := NULLIF(v_line->>'expiry_date','')::date;
    v_mfg_date := NULLIF(v_line->>'mfg_date','')::date;

    INSERT INTO public.purchase_items(purchase_id, admin_id, item_name, unit, quantity, rate, total, batch_no, expiry_date)
      VALUES (v_purchase_id, v_admin_id, v_line->>'item_name', v_line->>'unit',
              v_line_qty, COALESCE((v_line->>'rate')::numeric, 0), v_line_total,
              v_batch_no, v_expiry_date)
      RETURNING id INTO v_line_id;

    FOR v_dist IN SELECT * FROM jsonb_array_elements(COALESCE(v_line->'distributions','[]'::jsonb))
    LOOP
      v_dist_qty := COALESCE((v_dist->>'quantity')::numeric, 0);
      v_dist_item := NULLIF(v_dist->>'item_id','')::uuid;
      v_dist_branch := (v_dist->>'branch_id')::uuid;

      INSERT INTO public.purchase_distributions(purchase_item_id, admin_id, branch_id, item_id, quantity)
        VALUES (v_line_id, v_admin_id, v_dist_branch, v_dist_item, v_dist_qty);

      IF v_dist_item IS NOT NULL THEN
        UPDATE public.items
          SET stock_quantity = COALESCE(stock_quantity,0) + v_dist_qty
          WHERE id = v_dist_item AND admin_id = v_admin_id AND branch_id = v_dist_branch
          RETURNING stock_quantity INTO v_new_stock;

        IF v_new_stock IS NOT NULL THEN
          INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
            VALUES (v_admin_id, v_dist_branch, v_dist_item, v_dist_qty, v_new_stock, 'purchase', v_purchase_id, v_purchase_no, v_user);

          IF v_batch_no IS NOT NULL AND v_expiry_date IS NOT NULL THEN
            INSERT INTO public.item_batches(item_id, batch_number, expiry_date, mfg_date, stock_quantity, admin_id, branch_id, cost_price)
              VALUES (v_dist_item, v_batch_no, v_expiry_date, v_mfg_date, v_dist_qty, v_admin_id, v_dist_branch, COALESCE((v_line->>'rate')::numeric, 0))
              ON CONFLICT (id) DO NOTHING;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.purchases SET total_amount = v_total WHERE id = v_purchase_id;
  RETURN jsonb_build_object('id', v_purchase_id, 'purchase_no', v_purchase_no, 'total', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_purchase_return(p_purchase_id uuid, p_supplier_id uuid, p_return_date date, p_reason text, p_notes text, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.get_user_admin_id();
  v_user uuid := auth.uid();
  v_return_id uuid;
  v_no text;
  v_seq int;
  v_line jsonb;
  v_qty numeric;
  v_rate numeric;
  v_total numeric := 0;
  v_line_total numeric;
  v_item_id uuid;
  v_branch_id uuid;
  v_new_stock numeric;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;

  -- Every branch whose stock will be reduced must be one the caller can manage
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) l
    WHERE NULLIF(l->>'branch_id','') IS NOT NULL
      AND NOT public.has_branch_write_access(v_admin, (l->>'branch_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'Not authorised for one of the selected branches';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(return_no FROM 5) AS INTEGER)),0)+1
    INTO v_seq FROM public.purchase_returns
    WHERE admin_id = v_admin AND return_no LIKE 'PRT-%';
  v_no := 'PRT-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO public.purchase_returns(admin_id, return_no, purchase_id, supplier_id, return_date, reason, notes, created_by)
    VALUES (v_admin, v_no, p_purchase_id, p_supplier_id, COALESCE(p_return_date, CURRENT_DATE), p_reason, p_notes, v_user)
    RETURNING id INTO v_return_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_rate := COALESCE((v_line->>'rate')::numeric, 0);
    v_item_id := NULLIF(v_line->>'item_id','')::uuid;
    v_branch_id := (v_line->>'branch_id')::uuid;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    v_line_total := v_qty * v_rate;
    v_total := v_total + v_line_total;

    INSERT INTO public.purchase_return_items(return_id, admin_id, branch_id, item_id, item_name, unit, quantity, rate, total)
      VALUES (v_return_id, v_admin, v_branch_id, v_item_id, v_line->>'item_name', v_line->>'unit', v_qty, v_rate, v_line_total);

    IF v_item_id IS NOT NULL THEN
      UPDATE public.items
        SET stock_quantity = COALESCE(stock_quantity,0) - v_qty
        WHERE id = v_item_id AND admin_id = v_admin AND branch_id = v_branch_id
        RETURNING stock_quantity INTO v_new_stock;
      IF v_new_stock IS NOT NULL THEN
        INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, notes, created_by)
          VALUES (v_admin, v_branch_id, v_item_id, -v_qty, v_new_stock, 'purchase_return', v_return_id, COALESCE(p_reason,'return'), v_no, v_user);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.purchase_returns SET total_amount = v_total WHERE id = v_return_id;
  RETURN jsonb_build_object('id', v_return_id, 'return_no', v_no, 'total', v_total);
END $function$;