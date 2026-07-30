-- 1. Create providers table
CREATE TABLE IF NOT EXISTS public.providers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    phone text,
    commission_type text DEFAULT 'percentage',
    commission_rate numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT providers_pkey PRIMARY KEY (id)
);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage providers" ON public.providers
    FOR ALL USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = providers.admin_id));

-- 2. Create appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    branch_id uuid,
    customer_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    service_name text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE,
    CONSTRAINT appointments_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers (id) ON DELETE CASCADE
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage appointments" ON public.appointments
    FOR ALL USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = appointments.admin_id));

-- 3. Modify bills and customers tables
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers (id),
ADD COLUMN IF NOT EXISTS due_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid';

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS current_balance numeric DEFAULT 0;

-- 4. Create customer_ledger table
CREATE TABLE IF NOT EXISTS public.customer_ledger (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    branch_id uuid,
    customer_id uuid NOT NULL,
    bill_id uuid,
    transaction_type text NOT NULL, -- 'credit' or 'debit'
    amount numeric NOT NULL,
    balance_after numeric NOT NULL,
    payment_mode text,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT customer_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT customer_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE,
    CONSTRAINT customer_ledger_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills (id) ON DELETE SET NULL
);

ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ledgers" ON public.customer_ledger
    FOR SELECT USING (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = customer_ledger.admin_id));
CREATE POLICY "Users can insert ledgers" ON public.customer_ledger
    FOR INSERT WITH CHECK (auth.uid() = admin_id OR auth.uid() IN (SELECT user_id FROM profiles WHERE admin_id = customer_ledger.admin_id));
-- Update RPC
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
  v_provider_id uuid;
  v_customer_id uuid;
  v_paid_amount numeric;
  v_due_amount numeric;
  v_payment_status text;

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
  
  IF p_bill_payload->>'provider_id' IS NOT NULL THEN
    v_provider_id := (p_bill_payload->>'provider_id')::uuid;
  END IF;
  v_paid_amount := coalesce((p_bill_payload->>'paid_amount')::numeric, -1); -- -1 means full payment by default


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
    provider_id,
    is_deleted, is_edited
  ) VALUES (
    v_bill_no, v_created_by, now(), v_discount, v_payment_mode::payment_method, v_payment_details,
    v_additional_charges, 0, 0, '{}'::jsonb, 0,
    v_order_type, v_table_no, v_customer_mobile, v_customer_gstin, v_branch_id, v_admin_id, v_channel,
    v_doctor_name, v_prescription_image_url,
    v_provider_id,
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

  IF v_paid_amount = -1 THEN
    v_paid_amount := v_final_total;
  END IF;
  
  v_due_amount := greatest(0, v_final_total - v_paid_amount);
  
  IF v_paid_amount = 0 THEN
    v_payment_status := 'unpaid';
  ELSIF v_due_amount > 0 THEN
    v_payment_status := 'partial';
  ELSE
    v_payment_status := 'paid';
  END IF;

  UPDATE bills
  SET total_amount = v_final_total,
      total_tax = round(v_total_tax, 2),
      tax_summary = v_tax_summary,
      round_off = round(v_round_off, 2),
      due_amount = v_due_amount,
      paid_amount = v_paid_amount,
      payment_status = v_payment_status
  WHERE id = v_bill_id;

  -- Khata Logic
  IF v_customer_mobile IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM customers WHERE phone = v_customer_mobile AND admin_id = v_admin_id LIMIT 1;
    IF v_customer_id IS NOT NULL THEN
      -- Record the bill debit (customer owes us money)
      UPDATE customers SET current_balance = coalesce(current_balance, 0) + v_final_total WHERE id = v_customer_id;
      
      INSERT INTO customer_ledger (admin_id, branch_id, customer_id, bill_id, transaction_type, amount, balance_after, created_by)
      VALUES (v_admin_id, v_branch_id, v_customer_id, v_bill_id, 'debit', v_final_total, (SELECT current_balance FROM customers WHERE id = v_customer_id), v_created_by);

      -- Record the payment credit (customer pays us)
      IF v_paid_amount > 0 THEN
        UPDATE customers SET current_balance = coalesce(current_balance, 0) - v_paid_amount WHERE id = v_customer_id;
        
        INSERT INTO customer_ledger (admin_id, branch_id, customer_id, bill_id, transaction_type, amount, balance_after, payment_mode, created_by)
        VALUES (v_admin_id, v_branch_id, v_customer_id, v_bill_id, 'credit', v_paid_amount, (SELECT current_balance FROM customers WHERE id = v_customer_id), v_payment_mode, v_created_by);
      END IF;
    END IF;
  END IF;

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
