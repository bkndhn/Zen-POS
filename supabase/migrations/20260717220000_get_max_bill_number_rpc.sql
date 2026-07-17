CREATE OR REPLACE FUNCTION public.get_max_bill_number(p_admin_id uuid, p_branch_id uuid, p_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max integer;
BEGIN
  IF p_branch_id IS NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM length(p_prefix) + 1) AS integer)), 0)
    INTO v_max
    FROM public.bills
    WHERE admin_id = p_admin_id
      AND branch_id IS NULL
      AND bill_no LIKE p_prefix || '%';
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM length(p_prefix) + 1) AS integer)), 0)
    INTO v_max
    FROM public.bills
    WHERE admin_id = p_admin_id
      AND branch_id = p_branch_id
      AND bill_no LIKE p_prefix || '%';
  END IF;
  RETURN v_max;
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;
