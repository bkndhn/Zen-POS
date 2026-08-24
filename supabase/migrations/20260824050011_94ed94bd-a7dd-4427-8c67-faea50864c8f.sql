DROP POLICY IF EXISTS "Super admins manage database-backups" ON storage.objects;
CREATE POLICY "Super admins manage database-backups"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'database-backups' AND public.is_super_admin())
WITH CHECK (bucket_id = 'database-backups' AND public.is_super_admin());