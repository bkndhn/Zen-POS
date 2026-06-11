
-- =========================================================
-- 1) STOCK LEDGER (unified audit trail)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid NOT NULL,
  change_qty numeric NOT NULL,
  balance_after numeric,
  source_type text NOT NULL, -- 'purchase' | 'sale' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'purchase_return'
  source_id uuid,
  reason text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_admin_created ON public.stock_ledger(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON public.stock_ledger(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_branch ON public.stock_ledger(branch_id, created_at DESC);

GRANT SELECT, INSERT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_select" ON public.stock_ledger FOR SELECT TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE POLICY "ledger_insert" ON public.stock_ledger FOR INSERT TO authenticated
  WITH CHECK (admin_id = public.get_user_admin_id() OR public.is_super_admin());

-- =========================================================
-- 2) STOCK TRANSFERS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  transfer_no text NOT NULL,
  from_branch_id uuid NOT NULL,
  to_branch_id uuid NOT NULL,
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  from_item_id uuid NOT NULL,
  to_item_id uuid NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
GRANT ALL ON public.stock_transfer_items TO service_role;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfers_select" ON public.stock_transfers FOR SELECT TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE POLICY "transfers_modify" ON public.stock_transfers FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (admin_id = public.get_user_admin_id() OR public.is_super_admin());

CREATE POLICY "transfer_items_select" ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE POLICY "transfer_items_modify" ON public.stock_transfer_items FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (admin_id = public.get_user_admin_id() OR public.is_super_admin());

CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) PURCHASE RETURNS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  return_no text NOT NULL,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  reason text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid,
  item_name text NOT NULL,
  unit text,
  quantity numeric NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;
GRANT ALL ON public.purchase_return_items TO service_role;

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_select" ON public.purchase_returns FOR SELECT TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE POLICY "returns_modify" ON public.purchase_returns FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (admin_id = public.get_user_admin_id() OR public.is_super_admin());

CREATE POLICY "return_items_select" ON public.purchase_return_items FOR SELECT TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE POLICY "return_items_modify" ON public.purchase_return_items FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (admin_id = public.get_user_admin_id() OR public.is_super_admin());

CREATE TRIGGER trg_returns_updated BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4) RPC: create_stock_transfer
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_transfer_date date,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

    -- Validate from item belongs to admin + from branch
    SELECT COALESCE(stock_quantity,0) INTO v_stock FROM public.items
      WHERE id = v_from_item AND admin_id = v_admin AND branch_id = p_from_branch_id;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'Source item not found: %', v_item_name; END IF;

    -- Debit source
    UPDATE public.items SET stock_quantity = COALESCE(stock_quantity,0) - v_qty
      WHERE id = v_from_item RETURNING stock_quantity INTO v_new_from;

    -- Credit destination
    UPDATE public.items SET stock_quantity = COALESCE(stock_quantity,0) + v_qty
      WHERE id = v_to_item AND admin_id = v_admin AND branch_id = p_to_branch_id
      RETURNING stock_quantity INTO v_new_to;
    IF v_new_to IS NULL THEN RAISE EXCEPTION 'Destination item not found: %', v_item_name; END IF;

    INSERT INTO public.stock_transfer_items(transfer_id, admin_id, from_item_id, to_item_id, item_name, quantity)
      VALUES (v_transfer_id, v_admin, v_from_item, v_to_item, v_item_name, v_qty);

    -- Ledger
    INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
      VALUES (v_admin, p_from_branch_id, v_from_item, -v_qty, v_new_from, 'transfer_out', v_transfer_id, v_no, v_user);
    INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
      VALUES (v_admin, p_to_branch_id, v_to_item, v_qty, v_new_to, 'transfer_in', v_transfer_id, v_no, v_user);
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'transfer_no', v_no);
END $$;

-- =========================================================
-- 5) RPC: create_purchase_return
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_purchase_return(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END $$;

-- =========================================================
-- 6) Patch create_purchase_transaction to write ledger
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_purchase_transaction(p_supplier_id uuid, p_invoice_no text, p_purchase_date date, p_notes text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;

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

    INSERT INTO public.purchase_items(purchase_id, admin_id, item_name, unit, quantity, rate, total, batch_no, expiry_date)
      VALUES (v_purchase_id, v_admin_id, v_line->>'item_name', v_line->>'unit',
              v_line_qty, COALESCE((v_line->>'rate')::numeric, 0), v_line_total,
              NULLIF(v_line->>'batch_no',''), NULLIF(v_line->>'expiry_date','')::date)
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
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.purchases SET total_amount = v_total WHERE id = v_purchase_id;
  RETURN jsonb_build_object('id', v_purchase_id, 'purchase_no', v_purchase_no, 'total', v_total);
END;
$function$;

-- =========================================================
-- 7) Patch apply_stock_adjustment to write ledger
-- =========================================================
CREATE OR REPLACE FUNCTION public.apply_stock_adjustment(p_item_id uuid, p_branch_id uuid, p_change_qty numeric, p_reason text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.get_user_admin_id();
  v_item_admin uuid;
  v_new_stock numeric;
  v_adj_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
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

-- =========================================================
-- 8) Trigger: log sales (bill_items) into stock_ledger
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_bill_item_to_ledger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_branch uuid;
  v_new_stock numeric;
BEGIN
  SELECT b.admin_id, b.branch_id INTO v_admin, v_branch
    FROM public.bills b WHERE b.id = NEW.bill_id;
  IF v_admin IS NULL THEN RETURN NEW; END IF;

  SELECT stock_quantity INTO v_new_stock FROM public.items WHERE id = NEW.item_id;

  INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
    VALUES (v_admin, v_branch, NEW.item_id, -NEW.quantity, v_new_stock, 'sale', NEW.bill_id, 'bill', auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bill_items_ledger ON public.bill_items;
CREATE TRIGGER trg_bill_items_ledger AFTER INSERT ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.log_bill_item_to_ledger();
