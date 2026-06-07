
-- =========================================================
-- SUPPLIERS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NULL,
  name text NOT NULL,
  phone text NULL,
  email text NULL,
  gstin text NULL,
  address text NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers admin access" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE INDEX IF NOT EXISTS idx_suppliers_admin ON public.suppliers(admin_id);

-- =========================================================
-- PURCHASES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  supplier_id uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_no text NOT NULL,
  invoice_no text NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text NULL,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Purchases admin access" ON public.purchases
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE INDEX IF NOT EXISTS idx_purchases_admin_date ON public.purchases(admin_id, purchase_date DESC);

-- =========================================================
-- PURCHASE ITEMS (per-line)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  item_name text NOT NULL,
  unit text NULL,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  batch_no text NULL,
  expiry_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Purchase items admin access" ON public.purchase_items
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);

-- =========================================================
-- PURCHASE DISTRIBUTIONS (line split across branches)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.purchase_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_item_id uuid NOT NULL REFERENCES public.purchase_items(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_distributions TO authenticated;
GRANT ALL ON public.purchase_distributions TO service_role;
ALTER TABLE public.purchase_distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Purchase distributions admin access" ON public.purchase_distributions
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE INDEX IF NOT EXISTS idx_pd_branch ON public.purchase_distributions(admin_id, branch_id);

-- =========================================================
-- STOCK ADJUSTMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid NOT NULL,
  change_qty numeric NOT NULL,
  reason text NOT NULL DEFAULT 'other',
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock adjustments admin access" ON public.stock_adjustments
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());
CREATE INDEX IF NOT EXISTS idx_sa_admin_branch ON public.stock_adjustments(admin_id, branch_id, item_id);

-- =========================================================
-- updated_at triggers
-- =========================================================
DROP TRIGGER IF EXISTS trg_suppliers_updated ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_purchases_updated ON public.purchases;
CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RPC: create_purchase_transaction
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_purchase_transaction(
  p_supplier_id uuid,
  p_invoice_no text,
  p_purchase_date date,
  p_notes text,
  p_lines jsonb  -- [{item_name, unit, quantity, rate, batch_no, expiry_date, distributions:[{branch_id, item_id, quantity}]}]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authorised';
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

    INSERT INTO public.purchase_items(purchase_id, admin_id, item_name, unit, quantity, rate, total, batch_no, expiry_date)
      VALUES (
        v_purchase_id, v_admin_id,
        v_line->>'item_name', v_line->>'unit',
        v_line_qty, COALESCE((v_line->>'rate')::numeric, 0), v_line_total,
        NULLIF(v_line->>'batch_no',''), NULLIF(v_line->>'expiry_date','')::date
      ) RETURNING id INTO v_line_id;

    FOR v_dist IN SELECT * FROM jsonb_array_elements(COALESCE(v_line->'distributions','[]'::jsonb))
    LOOP
      INSERT INTO public.purchase_distributions(purchase_item_id, admin_id, branch_id, item_id, quantity)
        VALUES (
          v_line_id, v_admin_id,
          (v_dist->>'branch_id')::uuid,
          NULLIF(v_dist->>'item_id','')::uuid,
          COALESCE((v_dist->>'quantity')::numeric, 0)
        );

      IF NULLIF(v_dist->>'item_id','') IS NOT NULL THEN
        UPDATE public.items
          SET stock_quantity = COALESCE(stock_quantity,0) + COALESCE((v_dist->>'quantity')::numeric,0)
          WHERE id = (v_dist->>'item_id')::uuid
            AND admin_id = v_admin_id
            AND branch_id = (v_dist->>'branch_id')::uuid;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.purchases SET total_amount = v_total WHERE id = v_purchase_id;

  RETURN jsonb_build_object('id', v_purchase_id, 'purchase_no', v_purchase_no, 'total', v_total);
END;
$$;

-- =========================================================
-- RPC: apply_stock_adjustment
-- =========================================================
CREATE OR REPLACE FUNCTION public.apply_stock_adjustment(
  p_item_id uuid,
  p_branch_id uuid,
  p_change_qty numeric,
  p_reason text,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := public.get_user_admin_id();
  v_item_admin uuid;
  v_new_stock numeric;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT admin_id INTO v_item_admin FROM public.items WHERE id = p_item_id AND branch_id = p_branch_id;
  IF v_item_admin IS NULL OR v_item_admin <> v_admin_id THEN
    RAISE EXCEPTION 'Item not found in branch';
  END IF;

  UPDATE public.items
    SET stock_quantity = COALESCE(stock_quantity,0) + p_change_qty
    WHERE id = p_item_id
    RETURNING stock_quantity INTO v_new_stock;

  INSERT INTO public.stock_adjustments(admin_id, branch_id, item_id, change_qty, reason, notes, created_by)
    VALUES (v_admin_id, p_branch_id, p_item_id, p_change_qty, COALESCE(p_reason,'other'), p_notes, auth.uid());

  RETURN jsonb_build_object('new_stock', v_new_stock);
END;
$$;

-- =========================================================
-- RPC: get_all_users_for_super_admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_all_users_for_super_admin()
RETURNS TABLE(
  profile_id uuid,
  user_id uuid,
  email text,
  name text,
  role text,
  hotel_name text,
  status text,
  admin_id uuid,
  admin_name text,
  last_login timestamptz,
  login_count int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT p.id, p.user_id, u.email::text, p.name, p.role::text, p.hotel_name,
         COALESCE(p.status,'active'), p.admin_id,
         (SELECT name FROM public.profiles ap WHERE ap.id = p.admin_id) AS admin_name,
         p.last_login, COALESCE(p.login_count,0), p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.role, p.created_at DESC;
END;
$$;
