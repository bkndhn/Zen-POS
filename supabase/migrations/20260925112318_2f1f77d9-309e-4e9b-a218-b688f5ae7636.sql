DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('secure_create_bill','link_auth_provider','vault_read_secret','trigger_shift_audit_reconciliation','claim_push_queue','notify_by_permission','trigger_shift_audit_open','trigger_push_new_bill','get_my_auth_providers','get_public_shop_settings_for_branch','generate_slow_day_alerts','trigger_push_new_remote_order','unlink_auth_provider','trigger_push_revenue_milestone','webhook_process_push_queue','trigger_antitheft_shift_variance','process_remote_order_auto_settle','trigger_antitheft_void','fire_antitheft_alert','trigger_antitheft_discount','trigger_push_low_stock','trigger_push_order_ready','get_public_shop_settings','trigger_push_khata_due','trigger_shift_audit_update','admin_send_custom_push','get_public_shop_settings_by_profile','trigger_push_service_request','trigger_antitheft_edit','resolve_profile_by_provider')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;

ALTER TABLE public._trigger_debug ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._trigger_debug FROM anon, authenticated;
CREATE POLICY "Super admins read trigger debug" ON public._trigger_debug FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "Anyone can view item images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for item-media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for promo-banners" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public read logos by name" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Anyone can view staging assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload staging assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update staging assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete staging assets" ON storage.objects;
CREATE POLICY "Owners read staging assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ai_staging_assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "Owners upload staging assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai_staging_assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "Owners update staging assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ai_staging_assets' AND (storage.foldername(name))[1] = (select auth.uid()::text))
  WITH CHECK (bucket_id = 'ai_staging_assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "Owners delete staging assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ai_staging_assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));