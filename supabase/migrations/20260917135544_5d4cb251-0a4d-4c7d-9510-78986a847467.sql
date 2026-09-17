
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_rate_limits_action_key_idx
  ON public.auth_rate_limits (action, bucket_key);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx
  ON public.auth_rate_limits (window_start);

GRANT ALL ON public.auth_rate_limits TO service_role;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages auth rate limits" ON public.auth_rate_limits;
CREATE POLICY "Service role manages auth rate limits"
  ON public.auth_rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(
  p_action text,
  p_identifier text,
  p_max_attempts integer DEFAULT 5,
  p_window_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_key text;
  v_max integer;
  v_window integer;
  v_now timestamptz := now();
  v_row public.auth_rate_limits%ROWTYPE;
  v_retry integer := 0;
BEGIN
  v_action := lower(trim(coalesce(p_action, '')));
  IF v_action = '' OR v_action !~ '^[a-z0-9_]{1,40}$' THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', 0, 'retry_after_seconds', 0);
  END IF;

  v_key := lower(trim(coalesce(p_identifier, 'anonymous')));
  v_key := left(v_key, 160);

  v_max := greatest(1, least(coalesce(p_max_attempts, 5), 100));
  v_window := greatest(10, least(coalesce(p_window_seconds, 300), 86400));

  DELETE FROM public.auth_rate_limits
  WHERE window_start < v_now - interval '1 day';

  INSERT INTO public.auth_rate_limits (action, bucket_key, window_start, hits)
  VALUES (v_action, v_key, v_now, 1)
  ON CONFLICT (action, bucket_key) DO UPDATE
  SET hits = CASE
        WHEN public.auth_rate_limits.window_start < v_now - make_interval(secs => v_window)
          THEN 1
        ELSE public.auth_rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN public.auth_rate_limits.window_start < v_now - make_interval(secs => v_window)
          THEN v_now
        ELSE public.auth_rate_limits.window_start
      END,
      updated_at = v_now
  RETURNING * INTO v_row;

  IF v_row.hits > v_max THEN
    v_retry := greatest(
      1,
      ceil(extract(epoch FROM (v_row.window_start + make_interval(secs => v_window)) - v_now))::int
    );
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_seconds', v_retry
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_max - v_row.hits,
    'retry_after_seconds', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_auth_rate_limit(
  p_action text,
  p_identifier text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_rate_limits
  WHERE action = lower(trim(coalesce(p_action, '')))
    AND bucket_key = left(lower(trim(coalesce(p_identifier, 'anonymous'))), 160);
$$;

REVOKE ALL ON FUNCTION public.check_auth_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_auth_rate_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_auth_rate_limit(text, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can insert sub-user profiles" ON public.profiles;
CREATE POLICY "Admins can insert sub-user profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.role = 'admin'::app_role
      )
      AND role = 'user'::app_role
      AND admin_id = public.get_my_profile_id()
    )
  );
