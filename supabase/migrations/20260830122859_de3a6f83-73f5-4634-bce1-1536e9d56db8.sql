
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text,
  p_platform text DEFAULT 'web',
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RAISE EXCEPTION 'Invalid device token';
  END IF;

  DELETE FROM public.user_devices
   WHERE device_token = p_token AND user_id <> auth.uid();

  INSERT INTO public.user_devices (user_id, device_token, platform, user_agent, last_seen_at, enabled)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'web'), left(COALESCE(p_user_agent, ''), 300), now(), true)
  ON CONFLICT (user_id, device_token) DO UPDATE
    SET platform = EXCLUDED.platform,
        user_agent = EXCLUDED.user_agent,
        last_seen_at = now(),
        enabled = true,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_device_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.user_devices
   WHERE user_id = auth.uid() AND device_token = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_push_gate()
RETURNS TABLE (unlocked boolean, enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_admin_profile uuid;
  v_admin_uid uuid;
BEGIN
  SELECT p.role,
         CASE WHEN p.role IN ('admin', 'super_admin') THEN p.id ELSE COALESCE(p.admin_id, p.id) END
    INTO v_role, v_admin_profile
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF v_admin_profile IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT true, true;
    RETURN;
  END IF;

  SELECT p.user_id INTO v_admin_uid FROM public.profiles p WHERE p.id = v_admin_profile;

  RETURN QUERY
  SELECT COALESCE(bool_or(s.fcm_unlocked), false),
         COALESCE(bool_or(s.fcm_unlocked AND s.fcm_enabled), false)
    FROM public.shop_settings s
   WHERE s.user_id IN (v_admin_uid, v_admin_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_device_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_push_gate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_push_gate() TO authenticated;
