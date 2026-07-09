-- =========================================================================
-- Security Hardening Migration — July 9, 2026
-- Fixes: audit trail immutability, bill integrity, ledger protection,
--        admin sub-user update guardrails, and table CHECK constraints.
-- =========================================================================

-- =========================================================================
-- 1. PROTECT STOCK LEDGER (AUDIT TRAIL) — Make immutable
--    Replace ALL policy with INSERT-only + SELECT-only (no UPDATE/DELETE)
-- =========================================================================
DROP POLICY IF EXISTS "ledger_write" ON public.stock_ledger;

-- Allow INSERT only (ledger entries should only be appended)
CREATE POLICY "ledger_insert"
  ON public.stock_ledger FOR INSERT
  TO authenticated
  WITH CHECK (has_branch_write_access(admin_id, branch_id));

-- Keep SELECT as-is (already correct)
-- ledger_read already exists

-- =========================================================================
-- 2. ADD CHECK CONSTRAINTS on bills and bill_items
--    Prevents negative amounts, quantities, discounts
-- =========================================================================
ALTER TABLE public.bills
  ADD CONSTRAINT bills_total_amount_non_negative CHECK (total_amount >= 0),
  ADD CONSTRAINT bills_discount_non_negative CHECK (discount >= 0);

ALTER TABLE public.bill_items
  ADD CONSTRAINT bill_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT bill_items_price_non_negative CHECK (price >= 0),
  ADD CONSTRAINT bill_items_total_non_negative CHECK (total >= 0);

-- =========================================================================
-- 3. RESTRICT ADMIN UPDATE OF SUB-USERS
--    Prevent admin from escalating a sub-user's role to 'admin' or 'super_admin'
-- =========================================================================
DROP POLICY IF EXISTS "Admin update sub-users" ON public.profiles;

CREATE POLICY "Admin update sub-users"
  ON public.profiles FOR UPDATE
  TO public
  USING (admin_id = get_my_profile_id())
  WITH CHECK (
    admin_id = get_my_profile_id()
    AND role = 'user'::app_role
  );

-- =========================================================================
-- 4. VALIDATE CALLER in create_bill_transaction
--    Add auth.uid() check to ensure the caller is the p_user_id owner
-- =========================================================================
-- We add an early guard to the latest overload (8 params)
CREATE OR REPLACE FUNCTION public.create_bill_transaction(
  p_bill_no text,
  p_payment_mode payment_method,
  p_items jsonb,
  p_user_id uuid,
  p_discount numeric,
  p_table_id uuid DEFAULT NULL,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_id uuid;
  v_days_bill_count integer;
  v_new_bill_no text;
  v_total_amount numeric := 0;
  v_item_record record;
  v_item_total numeric;
  v_item_obj jsonb;
  v_new_stock numeric;
  v_qty numeric;
  v_base_value numeric;
  v_bill_item_records jsonb[] := ARRAY[]::jsonb[];
  v_admin_id uuid;
  v_branch_id uuid;
BEGIN
  -- SECURITY: Verify the caller owns the profile they claim
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND user_id = auth.uid()
  ) THEN
    -- Allow admin creating bill on behalf of sub-user
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id
        AND admin_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller does not own the specified profile';
    END IF;
  END IF;

  -- VALIDATION: discount must be non-negative
  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  SELECT admin_id INTO v_admin_id FROM public.profiles WHERE id = p_user_id;
  IF v_admin_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
      v_admin_id := p_user_id;
    END IF;
  END IF;

  v_branch_id := p_branch_id;
  IF v_branch_id IS NULL AND v_admin_id IS NOT NULL THEN
    SELECT id INTO v_branch_id FROM public.branches
      WHERE admin_id = v_admin_id AND is_main LIMIT 1;
  END IF;

  IF v_admin_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1
      INTO v_days_bill_count
      FROM public.bills
      WHERE bill_no LIKE 'BILL-%' AND admin_id = v_admin_id;
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1
      INTO v_days_bill_count
      FROM public.bills
      WHERE bill_no LIKE 'BILL-%';
  END IF;
  v_new_bill_no := 'BILL-' || LPAD(v_days_bill_count::text, 6, '0');

  FOR v_item_obj IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_item_record FROM public.items
      WHERE id = (v_item_obj->>'item_id')::uuid
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found: %', v_item_obj->>'item_id';
    END IF;

    v_qty := (v_item_obj->>'quantity')::numeric;

    -- VALIDATION: quantity must be positive
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be positive: %', v_item_record.name;
    END IF;

    v_base_value := COALESCE(v_item_record.base_value, 1);
    IF v_base_value = 0 THEN v_base_value := 1; END IF;

    IF v_item_record.stock_quantity IS NOT NULL AND NOT COALESCE(v_item_record.unlimited_stock, false) THEN
      v_new_stock := v_item_record.stock_quantity - v_qty;
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for item: %', v_item_record.name;
      END IF;
      UPDATE public.items
        SET stock_quantity = v_new_stock,
            sale_count = COALESCE(sale_count, 0) + v_qty
        WHERE id = v_item_record.id;
    ELSE
      UPDATE public.items
        SET sale_count = COALESCE(sale_count, 0) + v_qty
        WHERE id = v_item_record.id;
    END IF;

    v_item_total := (v_qty / v_base_value) * v_item_record.price;
    v_total_amount := v_total_amount + v_item_total;

    v_bill_item_records := array_append(v_bill_item_records, jsonb_build_object(
      'item_id', v_item_record.id,
      'quantity', v_qty,
      'price', v_item_record.price,
      'total', v_item_total
    ));
  END LOOP;

  v_total_amount := GREATEST(0, v_total_amount - p_discount);

  INSERT INTO public.bills (
    bill_no, created_by, admin_id, branch_id, date, total_amount, discount,
    payment_mode, payment_details, kitchen_status, service_status
  ) VALUES (
    v_new_bill_no, p_user_id, v_admin_id, v_branch_id, CURRENT_DATE,
    v_total_amount, p_discount, p_payment_mode, p_payment_details,
    'pending', 'pending'
  ) RETURNING id INTO v_bill_id;

  INSERT INTO public.bill_items (bill_id, item_id, quantity, price, total)
  SELECT v_bill_id, (obj->>'item_id')::uuid, (obj->>'quantity')::numeric,
         (obj->>'price')::numeric, (obj->>'total')::numeric
  FROM unnest(v_bill_item_records) AS obj;

  RETURN jsonb_build_object(
    'success', true,
    'bill_id', v_bill_id,
    'bill_no', v_new_bill_no,
    'total_amount', v_total_amount,
    'branch_id', v_branch_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;
