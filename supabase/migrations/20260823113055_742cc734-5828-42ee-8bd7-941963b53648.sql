
-- 1) app_settings: remove blanket authenticated read
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON public.app_settings;

CREATE POLICY "Super admin can read app settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.get_app_support_info()
RETURNS TABLE(
  support_phone text,
  support_email text,
  support_whatsapp text,
  support_custom_details text,
  show_support_phone boolean,
  show_support_email boolean,
  show_support_whatsapp boolean,
  show_support_custom boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.support_phone, s.support_email, s.support_whatsapp, s.support_custom_details,
         COALESCE(s.show_support_phone, true), COALESCE(s.show_support_email, true),
         COALESCE(s.show_support_whatsapp, true), COALESCE(s.show_support_custom, true)
  FROM public.app_settings s
  WHERE s.id = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_app_support_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_app_support_info() TO authenticated;

-- 2) payment_settings: only super admin reads the raw row
DROP POLICY IF EXISTS "admins_read_payment_settings" ON public.payment_settings;

CREATE OR REPLACE FUNCTION public.get_platform_payment_settings()
RETURNS TABLE(
  upi_id text,
  upi_qr_image_url text,
  default_amount integer,
  payment_instructions text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.upi_id, p.upi_qr_image_url, p.default_amount, p.payment_instructions
  FROM public.payment_settings p
  WHERE EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.user_id = auth.uid()
      AND pr.role IN ('admin','super_admin')
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_platform_payment_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_payment_settings() TO authenticated;

-- 3) providers / appointments: tenant scoping via get_my_admin_id()
DROP POLICY IF EXISTS "Users can manage providers" ON public.providers;
CREATE POLICY "Tenant can manage providers"
ON public.providers FOR ALL
TO authenticated
USING (admin_id IS NOT NULL AND admin_id = public.get_my_admin_id())
WITH CHECK (admin_id IS NOT NULL AND admin_id = public.get_my_admin_id());

DROP POLICY IF EXISTS "Users can manage appointments" ON public.appointments;
CREATE POLICY "Tenant can manage appointments"
ON public.appointments FOR ALL
TO authenticated
USING (admin_id IS NOT NULL AND admin_id = public.get_my_admin_id())
WITH CHECK (admin_id IS NOT NULL AND admin_id = public.get_my_admin_id());
