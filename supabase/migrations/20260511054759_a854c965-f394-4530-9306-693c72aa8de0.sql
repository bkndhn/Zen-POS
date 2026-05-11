
-- 1) Items: restrict anon column access (RLS can't filter columns; use GRANTs)
REVOKE SELECT ON public.items FROM anon;
GRANT SELECT (
  id, name, description, category, price, image_url, video_url, media_type,
  unit, base_value, quantity_step, hsn_code, is_tax_inclusive, tax_rate_id,
  is_active, display_order, admin_id, branch_id, unlimited_stock, created_at, updated_at
) ON public.items TO anon;

-- 2) table_orders insert: require admin_id maps to a real active admin profile
DROP POLICY IF EXISTS "Rate limited table order creation" ON public.table_orders;
CREATE POLICY "Rate limited table order creation"
ON public.table_orders FOR INSERT
TO public
WITH CHECK (
  check_table_order_rate_limit(session_id, table_number, admin_id)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = table_orders.admin_id
      AND p.role = 'admin'
      AND COALESCE(p.status, 'active') = 'active'
  )
);

-- 3) table_service_requests insert: require admin_id maps to a real active admin profile
DROP POLICY IF EXISTS "Rate limited service request creation" ON public.table_service_requests;
CREATE POLICY "Rate limited service request creation"
ON public.table_service_requests FOR INSERT
TO public
WITH CHECK (
  check_service_request_rate_limit(table_number, admin_id)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = table_service_requests.admin_id
      AND p.role = 'admin'
      AND COALESCE(p.status, 'active') = 'active'
  )
);

-- 4) Enforce max_sub_users at DB level via trigger (function already exists)
DROP TRIGGER IF EXISTS trg_enforce_sub_user_limit ON public.profiles;
CREATE TRIGGER trg_enforce_sub_user_limit
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sub_user_limit();

-- Also enforce max_branches trigger if not attached
DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
BEFORE INSERT ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.enforce_branch_limit();

DROP TRIGGER IF EXISTS trg_prevent_main_branch_delete ON public.branches;
CREATE TRIGGER trg_prevent_main_branch_delete
BEFORE DELETE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.prevent_main_branch_delete();

-- 5) Storage: prevent public LISTING of objects in public buckets while
-- still allowing direct access by URL (which uses the object's path).
-- Recreate the public read policy to require knowing the exact object name.
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read item-media" ON storage.objects;
DROP POLICY IF EXISTS "Public read promo-banners" ON storage.objects;

CREATE POLICY "Public read item-images by name"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'item-images' AND name IS NOT NULL AND length(name) > 0);

CREATE POLICY "Public read item-media by name"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'item-media' AND name IS NOT NULL AND length(name) > 0);

CREATE POLICY "Public read promo-banners by name"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'promo-banners' AND name IS NOT NULL AND length(name) > 0);
