-- =========================================================================
-- 1. Create secure RPC function for tax rates
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_public_tax_rates(
  p_admin_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  rate numeric,
  cess_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Resolve admin's auth user_id
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = p_admin_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.rate, t.cess_rate
  FROM public.tax_rates t
  WHERE t.admin_id = v_user_id
    AND t.is_active = true
    AND (p_branch_id IS NULL OR t.branch_id IS NULL OR t.branch_id = p_branch_id);
END;
$$;

-- Grant execute permissions to public/anon/authenticated
GRANT EXECUTE ON FUNCTION public.get_public_tax_rates(uuid, uuid) TO anon, authenticated, service_role;

-- =========================================================================
-- 2. Drop overly permissive anonymous SELECT policies
-- =========================================================================

-- Drop public access to item_categories
DROP POLICY IF EXISTS "Public can view active categories" ON public.item_categories;

-- Drop public access to tax_rates
DROP POLICY IF EXISTS "Public can view active tax rates" ON public.tax_rates;
