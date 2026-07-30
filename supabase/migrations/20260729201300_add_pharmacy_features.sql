-- Migration to add Pharmacy/Medical Batch tracking and prescriptions

-- 1. Create item_batches table
CREATE TABLE IF NOT EXISTS public.item_batches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL,
    batch_number text NOT NULL,
    expiry_date date NOT NULL,
    mfg_date date,
    stock_quantity numeric NOT NULL DEFAULT 0,
    cost_price numeric,
    admin_id uuid NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT item_batches_pkey PRIMARY KEY (id),
    CONSTRAINT item_batches_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE
);

-- RLS Policies for item_batches
ALTER TABLE public.item_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own item batches" ON public.item_batches
    FOR SELECT USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = item_batches.admin_id));

CREATE POLICY "Users can insert their own item batches" ON public.item_batches
    FOR INSERT WITH CHECK (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = item_batches.admin_id));

CREATE POLICY "Users can update their own item batches" ON public.item_batches
    FOR UPDATE USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = item_batches.admin_id));

CREATE POLICY "Users can delete their own item batches" ON public.item_batches
    FOR DELETE USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = item_batches.admin_id));

-- 2. Add doctor and prescription to bills
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS doctor_name text,
ADD COLUMN IF NOT EXISTS prescription_image_url text;

-- 3. Override create_purchase_transaction to insert item_batches
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
  v_batch_no text;
  v_expiry_date date;
  v_mfg_date date;
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

-- 4. Trigger to handle FEFO batch deduction on sale
CREATE OR REPLACE FUNCTION public.deduct_batch_stock_on_sale()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_qty_to_deduct numeric;
  v_batch RECORD;
  v_admin uuid;
  v_branch uuid;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;

  SELECT admin_id, branch_id INTO v_admin, v_branch
    FROM public.bills WHERE id = NEW.bill_id;
  IF v_admin IS NULL THEN RETURN NEW; END IF;

  -- Only deduct if item has tracking (this trigger runs AFTER insert, so it's safe)
  v_qty_to_deduct := NEW.quantity;

  -- Find batches for this item ordered by expiry date (FEFO)
  FOR v_batch IN 
    SELECT id, stock_quantity FROM public.item_batches 
    WHERE item_id = NEW.item_id AND admin_id = v_admin AND branch_id = v_branch AND stock_quantity > 0
    ORDER BY expiry_date ASC
  LOOP
    IF v_qty_to_deduct <= 0 THEN EXIT; END IF;
    
    IF v_batch.stock_quantity >= v_qty_to_deduct THEN
      UPDATE public.item_batches SET stock_quantity = stock_quantity - v_qty_to_deduct WHERE id = v_batch.id;
      v_qty_to_deduct := 0;
    ELSE
      UPDATE public.item_batches SET stock_quantity = 0 WHERE id = v_batch.id;
      v_qty_to_deduct := v_qty_to_deduct - v_batch.stock_quantity;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deduct_batch_stock ON public.bill_items;
CREATE TRIGGER trg_deduct_batch_stock
  AFTER INSERT ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.deduct_batch_stock_on_sale();
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
  v_doctor_name text;
  v_prescription_image_url text;
  v_round_off numeric := 0;

  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_db_price numeric;
  v_db_base_value numeric;
  v_db_tax_rate_id uuid;
  v_db_is_tax_inclusive boolean;
  v_db_hsn_code text;
  v_db_name text;
  v_db_unit text;
  v_db_selling_unit text;
  v_db_inventory_unit text;
  v_db_stock_quantity numeric;

  v_tax_rate numeric := 0;
  v_cess_rate numeric := 0;

  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total_tax numeric := 0;
  v_final_total numeric := 0;

  v_taxable_amount numeric;
  v_tax_amount numeric;

  v_tax_summary jsonb := '{}'::jsonb;
  v_tax_summary_rate text;
  v_tax_summary_entry jsonb;

  v_recipe_part RECORD;
  v_deduction numeric;
  v_sell_short text;
  v_inv_short text;

  v_inserted_bill jsonb;

  v_caller_profile_id uuid;
  v_caller_admin_id uuid;
BEGIN
  v_bill_no := p_bill_payload->>'bill_no';
  v_created_by := (p_bill_payload->>'created_by')::uuid;
  v_payment_mode := p_bill_payload->>'payment_mode';
  v_payment_details := coalesce(p_bill_payload->'payment_details', '[]'::jsonb);
  v_additional_charges := coalesce(p_bill_payload->'additional_charges', '[]'::jsonb);
  v_discount := coalesce((p_bill_payload->>'discount')::numeric, 0);
  v_order_type := p_bill_payload->>'order_type';
  v_table_no := p_bill_payload->>'table_no';
  v_customer_mobile := p_bill_payload->>'customer_mobile';
  v_customer_gstin := p_bill_payload->>'customer_gstin';
  v_branch_id := (p_bill_payload->>'branch_id')::uuid;
  v_admin_id := (p_bill_payload->>'admin_id')::uuid;
  v_channel := coalesce(p_bill_payload->>'channel', 'store');
  v_billing_type := coalesce(p_bill_payload->>'billing_type', 'pos');
  v_doctor_name := p_bill_payload->>'doctor_name';
  v_prescription_image_url := p_bill_payload->>'prescription_image_url';

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
    doctor_name, prescription_image_url,
    is_deleted, is_edited
  ) VALUES (
    v_bill_no, v_created_by, now(), v_discount, v_payment_mode::payment_method, v_payment_details,
    v_additional_charges, 0, 0, '{}'::jsonb, 0,
    v_order_type, v_table_no, v_customer_mobile, v_customer_gstin, v_branch_id, v_admin_id, v_channel,
    v_doctor_name, v_prescription_image_url,
    false, false
  )
  RETURNING id INTO v_bill_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    v_qty := (v_item->>'quantity')::numeric;

    IF v_billing_type = 'calci' THEN
      v_item_id := NULL;
      v_db_name := coalesce(v_item->>'item_name_override', 'Calci Item');
      v_db_price := (v_item->>'price')::numeric;
      v_db_base_value := 1;
      v_db_tax_rate_id := NULL;
      v_db_is_tax_inclusive := true;
      v_db_hsn_code := NULL;
      v_db_unit := 'pcs';
      v_db_selling_unit := NULL;
      v_db_inventory_unit := NULL;
      v_db_stock_quantity := NULL;
    ELSE
      v_item_id := (v_item->>'id')::uuid;

      SELECT name, price, coalesce(base_value, 1), tax_rate_id, is_tax_inclusive, hsn_code, unit, selling_unit, inventory_unit, stock_quantity
      INTO v_db_name, v_db_price, v_db_base_value, v_db_tax_rate_id, v_db_is_tax_inclusive, v_db_hsn_code, v_db_unit, v_db_selling_unit, v_db_inventory_unit, v_db_stock_quantity
      FROM items
      WHERE id = v_item_id AND branch_id = v_branch_id;

      IF v_db_price IS NULL THEN
        RAISE EXCEPTION 'Item % not found or not in this branch', v_item_id;
      END IF;
    END IF;

    v_line_total := (v_qty / v_db_base_value) * v_db_price;
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

    INSERT INTO bill_items (
      bill_id, item_id, quantity, price, total,
      tax_rate_snapshot, tax_rate, hsn_code, tax_type,
      taxable_amount, tax_amount, billing_type, item_name_override
    ) VALUES (
      v_bill_id, v_item_id, v_qty, v_db_price, v_line_total,
      v_tax_rate, v_tax_rate, v_db_hsn_code, 'GST',
      v_taxable_amount, v_tax_amount, v_billing_type, CASE WHEN v_billing_type = 'calci' THEN v_db_name ELSE NULL END
    );

    IF v_billing_type != 'calci' THEN
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
              IF v_r_unit IN ('ml', 'milliliter', 'millilitre') THEN v_r_unit := 'ml'; END IF;
              IF v_r_unit IN ('l', 'liter', 'litre') THEN v_r_unit := 'l'; END IF;
              IF v_r_unit IN ('g', 'gram', 'grams') THEN v_r_unit := 'g'; END IF;
              IF v_r_unit IN ('kg', 'kilogram', 'kilograms') THEN v_r_unit := 'kg'; END IF;
              IF v_i_unit IN ('ml', 'milliliter', 'millilitre') THEN v_i_unit := 'ml'; END IF;
              IF v_i_unit IN ('l', 'liter', 'litre') THEN v_i_unit := 'l'; END IF;
              IF v_i_unit IN ('g', 'gram', 'grams') THEN v_i_unit := 'g'; END IF;
              IF v_i_unit IN ('kg', 'kilogram', 'kilograms') THEN v_i_unit := 'kg'; END IF;

              IF v_r_unit <> v_i_unit THEN
                IF v_r_unit = 'g' AND v_i_unit = 'kg' THEN v_deduction := v_deduction / 1000;
                ELSIF v_r_unit = 'kg' AND v_i_unit = 'g' THEN v_deduction := v_deduction * 1000;
                ELSIF v_r_unit = 'ml' AND v_i_unit = 'l' THEN v_deduction := v_deduction / 1000;
                ELSIF v_r_unit = 'l' AND v_i_unit = 'ml' THEN v_deduction := v_deduction * 1000;
                END IF;
              END IF;
            END;
          END IF;

          UPDATE ingredients
          SET stock_quantity = greatest(0, coalesce(stock_quantity, 0) - v_deduction)
          WHERE id = v_recipe_part.ingredient_id;
        END LOOP;
      ELSE
        v_deduction := v_qty;
        IF v_db_selling_unit IS NOT NULL AND v_db_inventory_unit IS NOT NULL THEN
          v_sell_short := lower(coalesce(substring(v_db_selling_unit from '\(([^)]+)\)'), substring(v_db_selling_unit from 1 for 3)));
          v_inv_short := lower(coalesce(substring(v_db_inventory_unit from '\(([^)]+)\)'), substring(v_db_inventory_unit from 1 for 3)));

          IF v_db_selling_unit ILIKE '%ml%' THEN v_sell_short := 'ml'; END IF;
          IF v_db_selling_unit ILIKE '%liter%' THEN v_sell_short := 'l'; END IF;
          IF v_db_selling_unit ILIKE '%gram%' THEN v_sell_short := 'g'; END IF;
          IF v_db_selling_unit ILIKE '%kg%' THEN v_sell_short := 'kg'; END IF;

          IF v_db_inventory_unit ILIKE '%ml%' THEN v_inv_short := 'ml'; END IF;
          IF v_db_inventory_unit ILIKE '%liter%' THEN v_inv_short := 'l'; END IF;
          IF v_db_inventory_unit ILIKE '%gram%' THEN v_inv_short := 'g'; END IF;
          IF v_db_inventory_unit ILIKE '%kg%' THEN v_inv_short := 'kg'; END IF;

          IF v_sell_short <> v_inv_short THEN
            IF v_sell_short = 'ml' AND v_inv_short = 'l' THEN v_deduction := v_qty / 1000;
            ELSIF v_sell_short = 'l' AND v_inv_short = 'ml' THEN v_deduction := v_qty * 1000;
            ELSIF v_sell_short = 'g' AND v_inv_short = 'kg' THEN v_deduction := v_qty / 1000;
            ELSIF v_sell_short = 'kg' AND v_inv_short = 'g' THEN v_deduction := v_qty * 1000;
            END IF;
          END IF;
        END IF;

        IF v_db_stock_quantity IS NOT NULL THEN
          UPDATE items
          SET stock_quantity = greatest(0, coalesce(stock_quantity, 0) - v_deduction),
              sale_count = coalesce(sale_count, 0) + v_qty
          WHERE id = v_item_id;
        ELSE
          UPDATE items
          SET sale_count = coalesce(sale_count, 0) + v_qty
          WHERE id = v_item_id;
        END IF;
      END IF;
    END IF;

    IF v_tax_rate > 0 THEN
      v_tax_summary_rate := v_tax_rate::text;
      IF v_tax_summary ? v_tax_summary_rate THEN
        v_tax_summary_entry := v_tax_summary->v_tax_summary_rate;
        v_tax_summary := jsonb_set(
          v_tax_summary,
          array[v_tax_summary_rate],
          jsonb_build_object(
            'taxable', (v_tax_summary_entry->>'taxable')::numeric + v_taxable_amount,
            'cgst', (v_tax_summary_entry->>'cgst')::numeric + (v_tax_amount / 2),
            'sgst', (v_tax_summary_entry->>'sgst')::numeric + (v_tax_amount / 2),
            'total', (v_tax_summary_entry->>'total')::numeric + v_tax_amount
          )
        );
      ELSE
        v_tax_summary := jsonb_set(
          v_tax_summary,
          array[v_tax_summary_rate],
          jsonb_build_object(
            'taxable', v_taxable_amount,
            'cgst', v_tax_amount / 2,
            'sgst', v_tax_amount / 2,
            'total', v_tax_amount
          )
        );
      END IF;
    END IF;
  END LOOP;

  DECLARE
    v_charge jsonb;
    v_charge_amt numeric;
  BEGIN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(v_additional_charges)
    LOOP
      v_charge_amt := (v_charge->>'amount')::numeric;
      v_subtotal := v_subtotal + v_charge_amt;
    END LOOP;
  END;

  v_final_total := v_subtotal - v_discount;
  v_round_off := round(v_final_total) - v_final_total;
  v_final_total := round(v_final_total);

  UPDATE bills
  SET total_amount = v_final_total,
      total_tax = round(v_total_tax, 2),
      tax_summary = v_tax_summary,
      round_off = round(v_round_off, 2)
  WHERE id = v_bill_id;

  SELECT jsonb_build_object(
    'id', id,
    'bill_no', bill_no,
    'total_amount', total_amount,
    'total_tax', total_tax,
    'tax_summary', tax_summary,
    'round_off', round_off
  ) INTO v_inserted_bill
  FROM bills
  WHERE id = v_bill_id;

  RETURN v_inserted_bill;
END;
$function$;
