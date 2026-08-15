CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.admin_storage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  kind text NOT NULL,
  threshold integer NOT NULL,
  percent numeric NOT NULL DEFAULT 0,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_storage_alerts TO authenticated;
GRANT ALL ON public.admin_storage_alerts TO service_role;

ALTER TABLE public.admin_storage_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage their storage alerts"
ON public.admin_storage_alerts FOR ALL TO authenticated
USING (admin_id = public.get_my_admin_id() OR public.is_super_admin())
WITH CHECK (admin_id = public.get_my_admin_id() OR public.is_super_admin());

CREATE INDEX IF NOT EXISTS admin_storage_alerts_lookup
ON public.admin_storage_alerts (admin_id, kind, threshold, created_at DESC);

CREATE TRIGGER update_admin_storage_alerts_updated_at
BEFORE UPDATE ON public.admin_storage_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();