
-- AI Insights usage limits + logs (per-admin, controlled by super admin)
CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  admin_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily','weekly','monthly','lifetime')),
  quota integer NOT NULL DEFAULT 30,
  used_count integer NOT NULL DEFAULT 0,
  lifetime_quota integer,
  lifetime_used integer NOT NULL DEFAULT 0,
  period_started_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_limits TO authenticated;
GRANT ALL ON public.ai_usage_limits TO service_role;

ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read own limits"
  ON public.ai_usage_limits FOR SELECT TO authenticated
  USING (
    admin_id = public.get_user_admin_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin manages limits"
  ON public.ai_usage_limits FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.ai_insights_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid,
  user_id uuid,
  kind text NOT NULL,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_insights_log_admin_idx ON public.ai_insights_log (admin_id, created_at DESC);

GRANT SELECT ON public.ai_insights_log TO authenticated;
GRANT ALL ON public.ai_insights_log TO service_role;

ALTER TABLE public.ai_insights_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read own AI logs"
  ON public.ai_insights_log FOR SELECT TO authenticated
  USING (admin_id = public.get_user_admin_id() OR public.is_super_admin());
