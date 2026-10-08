CREATE OR REPLACE FUNCTION public.get_public_tokens(p_admin_id uuid)
RETURNS TABLE(id uuid, bill_no text, table_no text, order_type text, kitchen_status text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.bill_no::text, b.table_no::text, b.order_type::text, b.kitchen_status::text, b.created_at
  FROM public.bills b
  WHERE b.admin_id = p_admin_id
    AND b.created_at > now() - interval '18 hours'
    AND COALESCE(b.is_deleted, false) = false
    AND b.kitchen_status::text IN ('pending','preparing','ready')
    AND COALESCE(b.service_status::text, '') NOT IN ('completed','rejected')
  ORDER BY b.created_at ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_public_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tokens(uuid) TO anon, authenticated;