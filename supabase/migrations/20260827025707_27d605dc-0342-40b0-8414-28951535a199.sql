CREATE OR REPLACE FUNCTION public.get_public_watermark_info()
RETURNS TABLE(show_powered_by_watermark boolean, powered_by_contact text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(s.show_powered_by_watermark, true), s.powered_by_contact
  FROM public.app_settings s
  WHERE s.id = true
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_public_watermark_info() FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_watermark_info() TO anon, authenticated;