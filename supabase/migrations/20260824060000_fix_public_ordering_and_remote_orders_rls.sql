-- Fix Public Ordering & Remote Orders placement
-- 1. Create SECURITY DEFINER RPC to safely place remote orders without RLS select errors
CREATE OR REPLACE FUNCTION public.public_place_remote_order(
  p_order jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_branch_id uuid;
  v_device_id text;
  v_order_num integer;
  v_id uuid;
  v_created timestamptz;
BEGIN
  v_admin_id := (p_order->>'admin_id')::uuid;
  v_branch_id := NULLIF(p_order->>'branch_id', '')::uuid;
  v_device_id := p_order->>'device_id';

  IF v_admin_id IS NULL OR v_device_id IS NULL THEN
    RAISE EXCEPTION 'Invalid order parameters';
  END IF;

  IF NOT public.is_public_ordering_enabled(v_admin_id) THEN
    RAISE EXCEPTION 'Online ordering is disabled for this shop';
  END IF;

  -- Get next atomic order number
  v_order_num := public.get_next_remote_order_number(v_admin_id, v_branch_id);

  INSERT INTO public.remote_orders (
    admin_id,
    branch_id,
    device_id,
    order_number,
    customer_name,
    customer_phone,
    order_type,
    customer_address,
    delivery_address,
    delivery_distance_km,
    is_scheduled,
    scheduled_for,
    subtotal,
    tax_total,
    delivery_fee,
    packaging_fee,
    surge_fee,
    tip_amount,
    total_amount,
    payment_mode,
    payment_method,
    status,
    pickup_pin,
    items,
    is_paid
  ) VALUES (
    v_admin_id,
    v_branch_id,
    v_device_id,
    v_order_num,
    COALESCE(p_order->>'customer_name', 'Guest'),
    p_order->>'customer_phone',
    COALESCE(p_order->>'order_type', 'pickup'),
    p_order->>'customer_address',
    p_order->>'delivery_address',
    (p_order->>'delivery_distance_km')::numeric,
    COALESCE((p_order->>'is_scheduled')::boolean, false),
    (p_order->>'scheduled_for')::timestamptz,
    COALESCE((p_order->>'subtotal')::numeric, 0),
    COALESCE((p_order->>'tax_total')::numeric, 0),
    COALESCE((p_order->>'delivery_fee')::numeric, 0),
    COALESCE((p_order->>'packaging_fee')::numeric, 0),
    COALESCE((p_order->>'surge_fee')::numeric, 0),
    COALESCE((p_order->>'tip_amount')::numeric, 0),
    COALESCE((p_order->>'total_amount')::numeric, 0),
    COALESCE(p_order->>'payment_mode', 'pay_on_pickup'),
    p_order->>'payment_method',
    'pending',
    COALESCE(p_order->>'pickup_pin', '0000'),
    COALESCE(p_order->'items', '[]'::jsonb),
    false
  )
  RETURNING id, created_at INTO v_id, v_created;

  RETURN jsonb_build_object('id', v_id, 'order_number', v_order_num, 'created_at', v_created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_place_remote_order(jsonb) TO anon, authenticated;

-- 2. Restore scoped SELECT policy for anonymous customers to query their own orders by device_id
DROP POLICY IF EXISTS "remote_orders_anon_select_by_device" ON public.remote_orders;
CREATE POLICY "remote_orders_anon_select_by_device"
ON public.remote_orders
FOR SELECT
TO anon, authenticated
USING (device_id IS NOT NULL);
