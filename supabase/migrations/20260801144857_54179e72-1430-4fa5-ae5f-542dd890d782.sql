-- 1) Remove fully-permissive public policy on customers
DROP POLICY IF EXISTS customers_public_all ON public.customers;

-- Safe, narrow path for guest checkout customer capture
CREATE OR REPLACE FUNCTION public.public_upsert_customer(
  p_admin_id uuid,
  p_branch_id uuid,
  p_phone text,
  p_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := left(trim(coalesce(p_name, '')), 100);
BEGIN
  IF p_admin_id IS NULL OR length(v_phone) < 7 OR length(v_phone) > 15 THEN
    RETURN;
  END IF;

  UPDATE public.customers
     SET name = COALESCE(NULLIF(v_name, ''), name),
         last_visit = now(),
         updated_at = now()
   WHERE admin_id = p_admin_id AND phone = v_phone;

  IF NOT FOUND THEN
    INSERT INTO public.customers (admin_id, branch_id, phone, name, last_visit, created_at, updated_at)
    VALUES (p_admin_id, p_branch_id, v_phone, NULLIF(v_name, ''), now(), now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.public_upsert_customer(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_upsert_customer(uuid, uuid, text, text) TO anon, authenticated;

-- 2) Remove always-true anonymous UPDATE on remote_orders
DROP POLICY IF EXISTS remote_orders_anon_update ON public.remote_orders;

CREATE OR REPLACE FUNCTION public.submit_remote_order_feedback(
  p_order_id uuid,
  p_device_id text,
  p_rating integer,
  p_feedback text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_order_id IS NULL OR coalesce(p_device_id, '') = '' THEN
    RETURN false;
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RETURN false;
  END IF;

  UPDATE public.remote_orders
     SET rating = p_rating,
         feedback_text = left(coalesce(p_feedback, ''), 1000)
   WHERE id = p_order_id
     AND device_id = p_device_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_remote_order_feedback(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_remote_order_feedback(uuid, text, integer, text) TO anon, authenticated;