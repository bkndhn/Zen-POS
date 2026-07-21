
CREATE TABLE public.rum_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID,
  user_id UUID,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value_ms NUMERIC,
  route TEXT,
  meta JSONB,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rum_events_created_at ON public.rum_events(created_at DESC);
CREATE INDEX idx_rum_events_admin_id ON public.rum_events(admin_id);
CREATE INDEX idx_rum_events_metric_type ON public.rum_events(metric_type);

GRANT SELECT, INSERT ON public.rum_events TO authenticated;
GRANT ALL ON public.rum_events TO service_role;

ALTER TABLE public.rum_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own rum events"
  ON public.rum_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can read all rum events"
  ON public.rum_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'super_admin'
  ));
