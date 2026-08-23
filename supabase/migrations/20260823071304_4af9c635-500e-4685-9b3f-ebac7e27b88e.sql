-- 1) app_settings: remove anonymous read, expose only legal text publicly via RPC
DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;

CREATE POLICY "Authenticated users can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.app_settings FROM anon;
GRANT SELECT ON public.app_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_legal_content()
RETURNS TABLE (terms_and_conditions text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.terms_and_conditions, s.updated_at
  FROM public.app_settings s
  WHERE s.id = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_legal_content() TO anon, authenticated;

-- 2) Drop legacy overlapping admin-wide policies (branch-scoped ones remain)
DROP POLICY IF EXISTS "Full items access" ON public.items;
DROP POLICY IF EXISTS "Full item categories access" ON public.item_categories;
DROP POLICY IF EXISTS "Full payments access" ON public.payments;
DROP POLICY IF EXISTS "Full tables access" ON public.tables;
DROP POLICY IF EXISTS "Full additional charges access" ON public.additional_charges;
DROP POLICY IF EXISTS "Secure bills access" ON public.bills;
DROP POLICY IF EXISTS "Secure expenses access" ON public.expenses;

-- 3) item_variants: branch-scoped access via parent item
DROP POLICY IF EXISTS "Enable all for admin" ON public.item_variants;
DROP POLICY IF EXISTS "item_variants_owner_read" ON public.item_variants;

CREATE POLICY "item_variants_select"
ON public.item_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_variants.item_id
      AND public.has_branch_read_access(i.admin_id, i.branch_id)
  )
);

CREATE POLICY "item_variants_modify"
ON public.item_variants
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_variants.item_id
      AND public.has_branch_write_access(i.admin_id, i.branch_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_variants.item_id
      AND public.has_branch_write_access(i.admin_id, i.branch_id)
  )
);
