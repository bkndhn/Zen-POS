-- 1) Internal secret for scheduled push processing (never exposed to app users)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.internal_secrets (name text PRIMARY KEY, value text NOT NULL);
REVOKE ALL ON private.internal_secrets FROM PUBLIC, anon, authenticated;
INSERT INTO private.internal_secrets(name, value)
VALUES ('push_queue_cron', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_internal_secret(p_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT value FROM private.internal_secrets WHERE name = p_name
$$;
REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.webhook_process_push_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ivleyttlqlqawghvfyjz.supabase.co/functions/v1/process-push-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT value FROM private.internal_secrets WHERE name = 'push_queue_cron')
    ),
    body := '{}'::jsonb
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_process_push_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ivleyttlqlqawghvfyjz.supabase.co/functions/v1/process-push-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT value FROM private.internal_secrets WHERE name = 'push_queue_cron')
    ),
    body := '{}'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION public.run_process_push_queue() FROM PUBLIC, anon, authenticated;

SELECT cron.alter_job(10, command := 'SELECT public.run_process_push_queue();');

-- 2) Subscription / licence fields can only be changed by the super admin (or server)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Changing account role is not permitted'; END IF;
  IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN RAISE EXCEPTION 'Changing account owner is not permitted'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Changing linked login is not permitted'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Changing profile identity is not permitted'; END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.subscription_amount IS DISTINCT FROM OLD.subscription_amount
     OR NEW.force_logout IS DISTINCT FROM OLD.force_logout
     OR NEW.force_logout_reason IS DISTINCT FROM OLD.force_logout_reason
     OR NEW.client_permissions IS DISTINCT FROM OLD.client_permissions
     OR NEW.max_branches IS DISTINCT FROM OLD.max_branches
     OR NEW.max_sub_users IS DISTINCT FROM OLD.max_sub_users
     OR NEW.item_limit IS DISTINCT FROM OLD.item_limit THEN
    RAISE EXCEPTION 'Subscription and plan settings can only be changed by the platform administrator';
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Reports PIN verified on the server (hash never readable by staff)
CREATE TABLE IF NOT EXISTS private.report_pins (
  admin_id uuid NOT NULL,
  scope_key text NOT NULL,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, scope_key)
);
REVOKE ALL ON private.report_pins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_report_pin(p_branch_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, extensions AS $$
DECLARE v_admin uuid := public.get_user_admin_id(); v_key text := coalesce(p_branch_id::text, 'all');
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin_or_super() THEN RAISE EXCEPTION 'Only the shop owner can set the reports PIN'; END IF;
  IF p_pin IS NULL OR p_pin = '' THEN
    DELETE FROM private.report_pins WHERE admin_id = v_admin AND scope_key = v_key;
    RETURN false;
  END IF;
  IF p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be exactly 4 digits'; END IF;
  INSERT INTO private.report_pins(admin_id, scope_key, pin_hash)
  VALUES (v_admin, v_key, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  ON CONFLICT (admin_id, scope_key) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_report_pin(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM private.report_pins
    WHERE admin_id = public.get_user_admin_id() AND scope_key = coalesce(p_branch_id::text, 'all'))
$$;

CREATE OR REPLACE FUNCTION public.verify_report_pin(p_branch_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, extensions AS $$
DECLARE v_admin uuid := public.get_user_admin_id(); v_hash text;
BEGIN
  IF v_admin IS NULL THEN RETURN false; END IF;
  SELECT pin_hash INTO v_hash FROM private.report_pins
   WHERE admin_id = v_admin AND scope_key = coalesce(p_branch_id::text, 'all');
  IF v_hash IS NULL THEN RETURN true; END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RETURN false; END IF;
  RETURN extensions.crypt(p_pin, v_hash) = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.set_report_pin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_report_pin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_report_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_report_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_report_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_pin(uuid, text) TO authenticated;