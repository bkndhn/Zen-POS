-- Public menu items RPC: returns only safe columns, callable by anon.
CREATE OR REPLACE FUNCTION public.get_public_menu_items(p_admin_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  image_url text,
  video_url text,
  media_type text,
  category text,
  unit text,
  base_value numeric,
  is_active boolean,
  branch_id uuid,
  tax_rate_id uuid,
  is_tax_inclusive boolean,
  is_saleable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.name, i.price, i.image_url, i.video_url, i.media_type,
         i.category, i.unit, i.base_value, i.is_active, i.branch_id,
         i.tax_rate_id, i.is_tax_inclusive,
         COALESCE(i.is_saleable, true) AS is_saleable
  FROM public.items i
  WHERE i.admin_id = p_admin_id
    AND i.is_active = true
    AND COALESCE(i.is_saleable, true) = true
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
  ORDER BY i.category NULLS LAST, i.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_menu_items(uuid, uuid) TO anon, authenticated;

-- Public menu categories RPC: mirrors what the client filters client-side.
CREATE OR REPLACE FUNCTION public.get_public_menu_categories(p_admin_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, name text, branch_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.branch_id
  FROM public.item_categories c
  WHERE c.admin_id = p_admin_id
    AND COALESCE(c.is_deleted, false) = false
    AND (p_branch_id IS NULL OR c.branch_id = p_branch_id OR c.branch_id IS NULL)
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_menu_categories(uuid, uuid) TO anon, authenticated;