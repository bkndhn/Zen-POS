-- Fix kitchen_status and service_status columns: change from enum to text
ALTER TABLE bills ALTER COLUMN kitchen_status DROP DEFAULT;
ALTER TABLE bills ALTER COLUMN kitchen_status TYPE text USING kitchen_status::text;
ALTER TABLE bills ALTER COLUMN kitchen_status SET DEFAULT 'pending';

ALTER TABLE bills ALTER COLUMN service_status DROP DEFAULT;
ALTER TABLE bills ALTER COLUMN service_status TYPE text USING service_status::text;
ALTER TABLE bills ALTER COLUMN service_status SET DEFAULT 'pending';

-- Update secure_create_bill to not cast to enum
CREATE OR REPLACE FUNCTION secure_create_bill(
  p_admin_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_bill_no text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_payment_mode text DEFAULT 'Cash',
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_order_type text DEFAULT NULL,
  p_kitchen_status text DEFAULT 'pending',
  p_service_status text DEFAULT 'pending',
  p_billing_type text DEFAULT 'pos',
  p_additional_charges jsonb DEFAULT NULL,
  p_gst_amount numeric DEFAULT 0,
  p_gst_details jsonb DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_bill_id uuid;
  v_bill_no text;
  v_item jsonb;
  v_created_at timestamptz := now();
BEGIN
  -- Generate bill number if not provided
  IF p_bill_no IS NULL OR p_bill_no = '' THEN
    v_bill_no := 'B-' || to_char(v_created_at, 'YYYYMMDD-HH24MISS-MS');
  ELSE
    v_bill_no := p_bill_no;
  END IF;

  -- Insert the bill
  INSERT INTO bills (
    admin_id, branch_id, bill_no, subtotal, discount, total_amount,
    payment_mode, customer_name, customer_phone, notes, order_type,
    kitchen_status, service_status, billing_type,
    additional_charges, gst_amount, gst_details,
    created_at
  ) VALUES (
    p_admin_id, p_branch_id, v_bill_no, p_subtotal, p_discount, p_total,
    p_payment_mode, p_customer_name, p_customer_phone, p_notes, p_order_type,
    p_kitchen_status, p_service_status, p_billing_type,
    p_additional_charges, p_gst_amount, p_gst_details,
    v_created_at
  ) RETURNING id INTO v_bill_id;

  -- Insert bill items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO bill_items (
      bill_id, item_id, item_name, quantity, price, total,
      admin_id, item_name_override, billing_type
    ) VALUES (
      v_bill_id,
      (v_item->>'item_id')::uuid,
      COALESCE(v_item->>'item_name', v_item->>'name', 'Unknown'),
      COALESCE((v_item->>'quantity')::numeric, 1),
      COALESCE((v_item->>'price')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, 0),
      p_admin_id,
      v_item->>'item_name_override',
      p_billing_type
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_bill_id,
    'bill_no', v_bill_no,
    'created_at', v_created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record migration
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260720093000')
ON CONFLICT DO NOTHING;
