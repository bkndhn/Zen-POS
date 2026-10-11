DROP POLICY IF EXISTS "Public read landing config" ON public.super_admin_settings;
CREATE OR REPLACE FUNCTION public.get_public_landing_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT landing_page_config FROM public.super_admin_settings WHERE id = 1
$$;
REVOKE ALL ON FUNCTION public.get_public_landing_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_landing_config() TO anon, authenticated;