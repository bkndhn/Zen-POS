-- Restaurant-Only: Strip all non-restaurant logic from secure_create_bill
-- Removes: variant pricing, variant stock, doctor_name, prescription_image_url, provider_id
-- Keeps: All restaurant billing, GST, recipe ingredient deduction, unlimited stock, calci billing

CREATE OR REPLACE FUNCTION public.secure_create_bill(p_bill_payload jsonb, p_cart_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_id uuid;
  v_bill_no text;
  v_created_by uuid;
  v_payment_mode text;
  v_payment_details jsonb;
  v_additional_charges jsonb;
  v_discount numeric;
  v_order_type text;
  v_table_no text;
  v_customer_mobile text;
  v_customer_gstin text;
  v_branch_id uuid;
  v_admin_id uuid;
  v_channel text;
  v_billing_type text;
  v_round_off numeric := 0;
  v_customer_id uuid;
  v_paid_amount numeric;
  v_due_amount numeric;
  v_payment_status text;
  v_bill_date date;

  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_db_price numeric;
  v_db_base_value numeric;
  v_cart_base_value numeric;
  v_cart_unit text;
  v_cart_total numeric;
  v_db_tax_rate_id uuid;
  v_db_is_tax_inclusive boolean;
  v_db_hsn_code text;
  v_db_name text;
  v_db_unit text;
  v_db_selling_unit text;
  v_db_inventory_unit text;
  v_db_stock_quantity numeric;
  v_db_unlimited_stock boolean;
  v_item_name text;

  v_tax_rate numeric := 0;
  v_cess_rate numeric := 0;

  v_line_total numeric;
  v_subtotal numeric := 0;
  v_taxable_amount numeric := 0;
  v_tax_amount numeric := 0;
  v_total_tax numeric := 0;
  v_final_total numeric := 0;
  v_inserted_bill jsonb;
  v_caller_profile_id uuid;
  v_caller_admin_id uuid;
  
  v_recipe_part record;
  v_deduction numeric;
BEGIN
  v_bill_no := p_bill_payload->>'bill_no';
  v_created_by := (p_bill_payload->>'created_by')::uuid;
  v_payment_mode := p_bill_payload->>'payment_mode';
  v_payment_details := p_bill_payload->'payment_details';
  v_additional_charges := p_bill_payload->'additional_charges';
  v_discount := (p_bill_payload->>'discount')::numeric;
  v_order_type := p_bill_payload->>'order_type';
  v_table_no := p_bill_payload->>'table_no';
  v_customer_mobile := p_bill_payload->>'customer_mobile';
  v_customer_gstin := p_bill_payload->>'customer_gstin';
  v_branch_id := (p_bill_payload->>'branch_id')::uuid;
  v_admin_id := (p_bill_payload->>'admin_id')::uuid;
  v_channel := p_bill_payload->>'channel';
  v_billing_type := p_bill_payload->>'billing_type';

  IF v_additional_charges IS NULL OR jsonb_typeof(v_additional_charges) != 'array' THEN
    v_additional_charges := '[]'::jsonb;
  END IF;

  IF p_bill_payload->>'date' IS NOT NULL AND p_bill_payload->>'date' != '' THEN
    v_bill_date := (p_bill_payload->>'date')::date;
  ELSE
    v_bill_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;

  v_paid_amount := coalesce((p_bill_payload->>'paid_amount')::numeric, -1);

  IF v_bill_no IS NULL OR v_created_by IS NULL OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Missing required fields: bill_no, created_by, or branch_id';
  END IF;

  SELECT id, admin_id INTO v_caller_profile_id, v_caller_admin_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF v_created_by != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = v_created_by
      AND (admin_id = v_caller_profile_id OR user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Unauthorized: cannot create bill on behalf of another user';
    END IF;
  END IF;

  IF v_caller_admin_id IS NOT NULL THEN
    IF v_admin_id != v_caller_admin_id THEN
      RAISE EXCEPTION 'Unauthorized: admin_id does not match your tenant';
    END IF;
  ELSE
    IF v_admin_id != v_caller_profile_id THEN
      RAISE EXCEPTION 'Unauthorized: admin_id does not match your profile';
    END IF;
  END IF;

  INSERT INTO bills (
    bill_no, created_by, date, discount, payment_mode, payment_details,
    additional_charges, total_amount, total_tax, tax_summary, round_off,
    order_type, table_no, customer_mobile, customer_gstin, branch_id, admin_id, channel,
    is_deleted, is_edited
  ) VALUES (
    v_bill_no, v_created_by, v_bill_date, v_discount, v_payment_mode::payment_method, v_payment_details,
    v_additional_charges, 0, 0, '{}'::jsonb, 0,
    v_order_type, v_table_no, v_customer_mobile, v_customer_gstin, v_branch_id, v_admin_id, v_channel,
    false, false
  )
  RETURNING id INTO v_bill_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_cart_total := (v_item->>'total')::numeric;
    v_cart_base_value := (v_item->>'base_value')::numeric;
    v_cart_unit := coalesce(v_item->>'selling_unit', v_item->>'unit');

    -- MIXED CART FIX: Instead of relying on v_billing_type for the whole cart,
    -- rely on whether the item has a valid UUID (POS item) or not (Calci item)
    IF (v_item->>'id') IS NULL OR (v_item->>'id') = '' THEN
      v_item_id := NULL;
      v_db_name := coalesce(v_item->>'item_name_override', v_item->>'name', 'Calci Item');
      v_db_price := coalesce((v_item->>'price')::numeric, 0);
      v_db_base_value := 1;
      v_db_tax_rate_id := NULL;
      v_db_is_tax_inclusive := true;
      v_db_hsn_code := NULL;
      v_db_unit := 'pcs';
      v_db_selling_unit := NULL;
      v_db_inventory_unit := NULL;
      v_db_stock_quantity := NULL;
      v_db_unlimited_stock := true;
    ELSE
      v_item_id := (v_item->>'id')::uuid;

      SELECT name, price, coalesce(base_value, 1), tax_rate_id, is_tax_inclusive, hsn_code, unit, selling_unit, inventory_unit, stock_quantity, unlimited_stock
      INTO v_db_name, v_db_price, v_db_base_value, v_db_tax_rate_id, v_db_is_tax_inclusive, v_db_hsn_code, v_db_unit, v_db_selling_unit, v_db_inventory_unit, v_db_stock_quantity, v_db_unlimited_stock
      FROM items
      WHERE id = v_item_id AND branch_id = v_branch_id;

      IF v_db_price IS NULL THEN
        v_db_name := coalesce(v_item->>'item_name_override', v_item->>'name', 'Item');
        v_db_price := coalesce((v_item->>'price')::numeric, 0);
        v_db_base_value := 1;
      END IF;
    END IF;

    IF v_cart_total IS NOT NULL AND v_cart_total >= 0 THEN
      v_line_total := v_cart_total;
    ELSIF v_cart_base_value IS NOT NULL AND v_cart_base_value > 0 THEN
      v_line_total := (v_qty / v_cart_base_value) * v_db_price;
    ELSE
      v_line_total := (v_qty / coalesce(v_db_base_value, 1)) * v_db_price;
    END IF;

    v_subtotal := v_subtotal + v_line_total;

    v_tax_rate := 0;
    v_cess_rate := 0;
    IF v_db_tax_rate_id IS NOT NULL THEN
      SELECT rate, coalesce(cess_rate, 0) INTO v_tax_rate, v_cess_rate
      FROM tax_rates
      WHERE id = v_db_tax_rate_id;
    END IF;

    v_taxable_amount := v_line_total;
    v_tax_amount := 0;
    IF v_tax_rate > 0 OR v_cess_rate > 0 THEN
      IF coalesce(v_db_is_tax_inclusive, true) THEN
        v_taxable_amount := v_line_total / (1 + (v_tax_rate + v_cess_rate) / 100);
        v_tax_amount := v_line_total - v_taxable_amount;
      ELSE
        v_tax_amount := v_line_total * (v_tax_rate + v_cess_rate) / 100;
        v_subtotal := v_subtotal + v_tax_amount;
      END IF;
      v_total_tax := v_total_tax + v_tax_amount;
    END IF;

    v_taxable_amount := round(v_taxable_amount, 2);
    v_tax_amount := round(v_tax_amount, 2);
    v_item_name := coalesce(v_item->>'item_name_override', v_item->>'name', v_db_name, 'Item');

    INSERT INTO bill_items (
      bill_id, item_id, quantity, price, total,
      tax_rate_snapshot, tax_rate, hsn_code, tax_type,
      taxable_amount, tax_amount, billing_type, item_name_override,
      unit, base_value
    ) VALUES (
      v_bill_id, v_item_id, v_qty, v_db_price, v_line_total,
      v_tax_rate, v_tax_rate, v_db_hsn_code, 'GST',
      v_taxable_amount, v_tax_amount, coalesce(v_item->>'billing_type', v_billing_type), v_item_name,
      coalesce(v_cart_unit, v_db_selling_unit, v_db_unit, 'pcs'),
      coalesce(v_cart_base_value, v_db_base_value, 1)
    );

    -- Stock deduction (restaurant items + recipe ingredients)
    IF v_item_id IS NOT NULL AND NOT coalesce(v_db_unlimited_stock, false) THEN
      IF EXISTS (SELECT 1 FROM recipes WHERE item_id = v_item_id) THEN
        FOR v_recipe_part IN
          SELECT r.ingredient_id, r.quantity, r.recipe_unit, i.unit as ingredient_unit
          FROM recipes r
          JOIN ingredients i ON i.id = r.ingredient_id
          WHERE r.item_id = v_item_id
        LOOP
          v_deduction := v_recipe_part.quantity * v_qty;

          IF v_recipe_part.recipe_unit IS NOT NULL AND v_recipe_part.ingredient_unit IS NOT NULL THEN
            DECLARE
              v_r_unit text := lower(v_recipe_part.recipe_unit);
              v_i_unit text := lower(v_recipe_part.ingredient_unit);
            BEGIN
              IF (v_r_unit = 'g' OR v_r_unit = 'gram') AND (v_i_unit = 'kg' OR v_i_unit = 'kilogram') THEN
                v_deduction := v_deduction / 1000.0;
              ELSIF (v_r_unit = 'ml' OR v_r_unit = 'milliliter') AND (v_i_unit = 'l' OR v_i_unit = 'liter') THEN
                v_deduction := v_deduction / 1000.0;
              END IF;
            END;
          END IF;

          UPDATE ingredients
          SET stock_quantity = coalesce(stock_quantity, 0) - v_deduction,
              updated_at = now()
          WHERE id = v_recipe_part.ingredient_id;
        END LOOP;
      ELSE
        UPDATE items
        SET stock_quantity = coalesce(stock_quantity, 0) - v_qty,
            updated_at = now()
        WHERE id = v_item_id;
      END IF;
    END IF;
  END LOOP;

  -- Final bill total calculations
  DECLARE
    v_add_total numeric := 0;
    v_charge jsonb;
    v_charge_amt numeric;
  BEGIN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(v_additional_charges)
    LOOP
      v_charge_amt := (v_charge->>'amount')::numeric;
      IF v_charge_amt IS NOT NULL THEN
        v_add_total := v_add_total + v_charge_amt;
      END IF;
    END LOOP;

    v_final_total := v_subtotal + v_add_total - v_discount;
    v_round_off := round(v_final_total) - v_final_total;
    v_final_total := round(v_final_total);

    UPDATE bills
    SET total_amount = v_final_total,
        total_tax = round(v_total_tax, 2),
        round_off = v_round_off
    WHERE id = v_bill_id;
  END;

  SELECT jsonb_build_object(
    'id', b.id,
    'bill_no', b.bill_no,
    'total_amount', b.total_amount,
    'created_at', b.created_at,
    'date', b.date
  ) INTO v_inserted_bill
  FROM bills b
  WHERE b.id = v_bill_id;

  RETURN v_inserted_bill;
END;
$function$;

-- Disable the pharmacy batch deduction trigger (it fires on every bill_items insert and wastes CPU)
DROP TRIGGER IF EXISTS trg_deduct_batch_stock ON bill_items;
