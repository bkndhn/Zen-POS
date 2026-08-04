CREATE POLICY "Expense attachments read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND (storage.foldername(name))[1] = COALESCE(public.get_my_admin_id(), public.get_my_profile_id())::text
);

CREATE POLICY "Expense attachments insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-attachments'
  AND (storage.foldername(name))[1] = COALESCE(public.get_my_admin_id(), public.get_my_profile_id())::text
);

CREATE POLICY "Expense attachments update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND (storage.foldername(name))[1] = COALESCE(public.get_my_admin_id(), public.get_my_profile_id())::text
);

CREATE POLICY "Expense attachments delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND (storage.foldername(name))[1] = COALESCE(public.get_my_admin_id(), public.get_my_profile_id())::text
);