CREATE OR REPLACE FUNCTION public.get_public_table_seats(p_admin_id uuid, p_table_number text, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  table_number text,
  table_name text,
  capacity integer,
  has_seats boolean,
  seat_count integer,
  seat_configuration jsonb,
  seat_order_mode text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_number,
         t.table_name,
         t.capacity,
         COALESCE(t.has_seats, false),
         t.seat_count,
         to_jsonb(t.seat_configuration),
         COALESCE(t.seat_order_mode, 'both'),
         t.status::text
  FROM public.tables t
  WHERE t.admin_id = p_admin_id
    AND t.table_number = p_table_number
    AND t.is_active = true
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
  ORDER BY t.branch_id NULLS LAST
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_public_table_seats(uuid, text, uuid) TO anon, authenticated;