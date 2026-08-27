DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_settings;
REVOKE ALL ON public.app_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;