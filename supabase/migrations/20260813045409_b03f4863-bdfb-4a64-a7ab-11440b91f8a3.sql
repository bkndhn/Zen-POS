-- 1. ingredients / recipes: remove anon read
DROP POLICY IF EXISTS ingredients_select ON public.ingredients;
CREATE POLICY ingredients_select ON public.ingredients
FOR SELECT TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND admin_id = get_user_admin_id()));

DROP POLICY IF EXISTS recipes_select ON public.recipes;
CREATE POLICY recipes_select ON public.recipes
FOR SELECT TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND admin_id = get_user_admin_id()));

REVOKE ALL ON public.ingredients FROM anon;
REVOKE ALL ON public.recipes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
GRANT ALL ON public.recipes TO service_role;

-- 2. table_orders: anon may only insert (QR ordering), never read
REVOKE ALL ON public.table_orders FROM anon;
GRANT INSERT ON public.table_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_orders TO authenticated;
GRANT ALL ON public.table_orders TO service_role;

DROP POLICY IF EXISTS "Authenticated users view own shop orders" ON public.table_orders;
CREATE POLICY "Authenticated users view own shop orders" ON public.table_orders
FOR SELECT TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND admin_id = get_user_admin_id()));

-- 3. table_reservations: scope to owning admin/branch
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.table_reservations;

CREATE POLICY "Reservations select own shop" ON public.table_reservations
FOR SELECT TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND has_branch_read_access(admin_id, branch_id)));

CREATE POLICY "Reservations insert own shop" ON public.table_reservations
FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (admin_id IS NOT NULL AND has_branch_write_access(admin_id, branch_id)));

CREATE POLICY "Reservations update own shop" ON public.table_reservations
FOR UPDATE TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND has_branch_write_access(admin_id, branch_id)))
WITH CHECK (is_super_admin() OR (admin_id IS NOT NULL AND has_branch_write_access(admin_id, branch_id)));

CREATE POLICY "Reservations delete own shop" ON public.table_reservations
FOR DELETE TO authenticated
USING (is_super_admin() OR (admin_id IS NOT NULL AND has_branch_write_access(admin_id, branch_id)));

REVOKE ALL ON public.table_reservations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_reservations TO authenticated;
GRANT ALL ON public.table_reservations TO service_role;

-- 4. storage policies: explicit super_admin handling instead of NULL edge case
DROP POLICY IF EXISTS "Admin-scoped upload to item-images" ON storage.objects;
CREATE POLICY "Admin-scoped upload to item-images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'item-images' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped upload to item-media" ON storage.objects;
CREATE POLICY "Admin-scoped upload to item-media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'item-media' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped upload to promo-banners" ON storage.objects;
CREATE POLICY "Admin-scoped upload to promo-banners" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'promo-banners' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped update to item-images" ON storage.objects;
CREATE POLICY "Admin-scoped update to item-images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'item-images' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped update to item-media" ON storage.objects;
CREATE POLICY "Admin-scoped update to item-media" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'item-media' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped update to promo-banners" ON storage.objects;
CREATE POLICY "Admin-scoped update to promo-banners" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'promo-banners' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped delete from item-images" ON storage.objects;
CREATE POLICY "Admin-scoped delete from item-images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'item-images' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped delete from item-media" ON storage.objects;
CREATE POLICY "Admin-scoped delete from item-media" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'item-media' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));

DROP POLICY IF EXISTS "Admin-scoped delete from promo-banners" ON storage.objects;
CREATE POLICY "Admin-scoped delete from promo-banners" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'promo-banners' AND (is_super_admin() OR (get_user_admin_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_admin_id())::text)));