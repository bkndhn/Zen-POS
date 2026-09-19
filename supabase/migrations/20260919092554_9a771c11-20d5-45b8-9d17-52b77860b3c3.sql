DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;

CREATE POLICY "Logos tenant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      public.is_super_admin()
      OR position(public.get_my_admin_id()::text in name) > 0
      OR name LIKE public.get_my_admin_id()::text || '/%'
    )
  );

CREATE POLICY "Logos tenant update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      public.is_super_admin()
      OR position(public.get_my_admin_id()::text in name) > 0
      OR name LIKE public.get_my_admin_id()::text || '/%'
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      public.is_super_admin()
      OR position(public.get_my_admin_id()::text in name) > 0
      OR name LIKE public.get_my_admin_id()::text || '/%'
    )
  );

CREATE POLICY "Logos tenant delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      public.is_super_admin()
      OR position(public.get_my_admin_id()::text in name) > 0
      OR name LIKE public.get_my_admin_id()::text || '/%'
    )
  );