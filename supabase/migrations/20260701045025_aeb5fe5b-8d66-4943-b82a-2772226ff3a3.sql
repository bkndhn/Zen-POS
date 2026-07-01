
-- 1) Items: restrict anon column exposure
DROP POLICY IF EXISTS "Public can view active items by user_id" ON public.items;

CREATE POLICY "Anon can view active items"
ON public.items
FOR SELECT
TO anon
USING (is_active = true);

REVOKE SELECT ON public.items FROM anon;
GRANT SELECT (
  id, admin_id, name, description, price, category, unit, base_value,
  quantity_step, image_url, is_active, display_order, created_at, updated_at,
  media_type, video_url, tax_rate_id, is_tax_inclusive, hsn_code, branch_id,
  expiry_mode, quick_chips, selling_quantity, selling_unit, is_saleable
) ON public.items TO anon;

-- 2) Promo banners: remove public global read, expose via scoped RPC
DROP POLICY IF EXISTS "Public can view active banners" ON public.promo_banners;

CREATE OR REPLACE FUNCTION public.get_public_promo_banners(p_admin_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  image_url text,
  link_url text,
  is_text_only boolean,
  text_color text,
  bg_color text,
  branch_id uuid,
  display_order integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.title, b.description, b.image_url, b.link_url,
         b.is_text_only, b.text_color, b.bg_color, b.branch_id, b.display_order
  FROM public.promo_banners b
  WHERE b.admin_id = p_admin_id
    AND b.is_active = true
    AND (b.start_date IS NULL OR b.start_date <= now())
    AND (b.end_date IS NULL OR b.end_date >= now())
    AND (p_branch_id IS NULL OR b.branch_id IS NULL OR b.branch_id = p_branch_id)
  ORDER BY b.display_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_promo_banners(uuid, uuid) TO anon, authenticated;
