CREATE OR REPLACE FUNCTION public.set_report_pin(p_branch_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, extensions AS $$
DECLARE v_admin uuid := public.get_user_admin_id(); v_key text := coalesce(p_branch_id::text, 'all');
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin_or_super() THEN RAISE EXCEPTION 'Only the shop owner can set the reports PIN'; END IF;
  IF p_pin IS NOT NULL AND p_pin <> '' AND p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be exactly 4 digits'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('report-pin:' || v_admin::text, 0));
  DELETE FROM private.report_pin_unlocks u USING public.profiles p
  WHERE u.user_id = p.user_id AND (p.id = v_admin OR p.admin_id = v_admin);
  IF p_pin IS NULL OR p_pin = '' THEN
    DELETE FROM private.report_pins WHERE admin_id = v_admin AND scope_key = v_key;
    RETURN false;
  END IF;
  INSERT INTO private.report_pins(admin_id, scope_key, pin_hash)
  VALUES (v_admin, v_key, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  ON CONFLICT (admin_id, scope_key) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_report_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_report_pin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_report_pin(p_branch_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, extensions AS $$
DECLARE v_admin uuid := public.get_user_admin_id(); v_hash text; v_ok boolean;
BEGIN
  IF v_admin IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('report-pin:' || v_admin::text, 0));
  SELECT pin_hash INTO v_hash FROM private.report_pins
   WHERE admin_id = v_admin AND scope_key = coalesce(p_branch_id::text, 'all');
  IF v_hash IS NULL THEN
    v_ok := true;
  ELSIF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    v_ok := false;
  ELSE
    v_ok := extensions.crypt(p_pin, v_hash) = v_hash;
  END IF;
  IF v_ok THEN
    INSERT INTO private.report_pin_unlocks (user_id, scope_key, expires_at)
    VALUES (auth.uid(), coalesce(p_branch_id::text, 'all'), now() + interval '12 hours')
    ON CONFLICT (user_id, scope_key) DO UPDATE SET expires_at = EXCLUDED.expires_at;
  END IF;
  RETURN v_ok;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_report_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(uuid, text) TO authenticated;