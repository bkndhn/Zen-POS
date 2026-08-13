-- Place a table order as a guest (rate limited, shop must be active)
CREATE OR REPLACE FUNCTION public.public_place_table_order(
  p_admin_id uuid,
  p_branch_id uuid,
  p_table_number text,
  p_session_id text,
  p_seat_id text,
  p_order_scope text,
  p_order_number integer,
  p_items jsonb,
  p_total_amount numeric,
  p_customer_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_created timestamptz;
BEGIN
  IF p_admin_id IS NULL OR p_table_number IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Invalid order request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_admin_id
      AND p.role = 'admin'::app_role
      AND COALESCE(p.status, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'Shop not available';
  END IF;

  IF NOT public.check_table_order_rate_limit(p_session_id, p_table_number, p_admin_id) THEN
    RAISE EXCEPTION 'Too many orders, please try again shortly';
  END IF;

  INSERT INTO public.table_orders (
    admin_id, branch_id, table_number, session_id, seat_id, seat_label,
    order_scope, order_number, items, total_amount, customer_note, status
  ) VALUES (
    p_admin_id, p_branch_id, p_table_number, p_session_id, p_seat_id, p_seat_id,
    COALESCE(p_order_scope, 'table'), COALESCE(p_order_number, 1),
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_total_amount, 0), p_customer_note, 'pending'
  )
  RETURNING id, created_at INTO v_id, v_created;

  RETURN jsonb_build_object('id', v_id, 'created_at', v_created);
END;
$$;

-- Read only the orders belonging to a specific guest session
CREATE OR REPLACE FUNCTION public.get_public_session_orders(
  p_admin_id uuid,
  p_branch_id uuid,
  p_session_id text
)
RETURNS TABLE(
  id uuid, order_number integer, items jsonb, total_amount numeric,
  status text, customer_note text, created_at timestamptz, is_billed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.order_number, t.items, t.total_amount, t.status::text,
         t.customer_note, t.created_at, COALESCE(t.is_billed, false)
  FROM public.table_orders t
  WHERE t.admin_id = p_admin_id
    AND t.session_id = p_session_id
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
  ORDER BY t.order_number;
$$;

-- Resume an active session for this table/seat (returns only that session's orders)
CREATE OR REPLACE FUNCTION public.adopt_public_table_session(
  p_admin_id uuid,
  p_branch_id uuid,
  p_table_number text,
  p_seat_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session text;
  v_orders jsonb;
BEGIN
  SELECT t.session_id INTO v_session
  FROM public.table_orders t
  WHERE t.admin_id = p_admin_id
    AND t.table_number = p_table_number
    AND t.status::text IN ('pending', 'preparing', 'ready')
    AND COALESCE(t.is_billed, false) = false
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND ((p_seat_id IS NULL AND t.seat_id IS NULL) OR t.seat_id = p_seat_id)
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('session_id', NULL, 'orders', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.order_number), '[]'::jsonb) INTO v_orders
  FROM public.get_public_session_orders(p_admin_id, p_branch_id, v_session) o;

  RETURN jsonb_build_object('session_id', v_session, 'orders', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.public_place_table_order(uuid,uuid,text,text,text,text,integer,jsonb,numeric,text) FROM public;
REVOKE ALL ON FUNCTION public.get_public_session_orders(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.adopt_public_table_session(uuid,uuid,text,text) FROM public;

GRANT EXECUTE ON FUNCTION public.public_place_table_order(uuid,uuid,text,text,text,text,integer,jsonb,numeric,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_session_orders(uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adopt_public_table_session(uuid,uuid,text,text) TO anon, authenticated;

-- Guests no longer insert directly; the RPC handles it
DROP POLICY IF EXISTS "Rate limited table order creation" ON public.table_orders;
CREATE POLICY "Authenticated staff create table orders" ON public.table_orders
FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (admin_id IS NOT NULL AND admin_id = get_user_admin_id()));

REVOKE ALL ON public.table_orders FROM anon;