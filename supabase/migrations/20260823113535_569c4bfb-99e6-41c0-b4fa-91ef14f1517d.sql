
-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  action text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  actor_user_id uuid,
  actor_profile_id uuid,
  actor_role text,
  admin_id uuid,
  target_table text,
  target_record_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sec_audit_admin_time ON public.security_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_actor_time ON public.security_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_type_time ON public.security_audit_log (event_type, created_at DESC);

GRANT SELECT, INSERT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_audit_select" ON public.security_audit_log;
CREATE POLICY "sec_audit_select" ON public.security_audit_log
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (admin_id IS NOT NULL AND admin_id = public.get_my_admin_id() AND public.get_my_role() = 'admin')
  OR actor_user_id = auth.uid()
);

DROP POLICY IF EXISTS "sec_audit_insert_self" ON public.security_audit_log;
CREATE POLICY "sec_audit_insert_self" ON public.security_audit_log
FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid());

-- 2. Central logging function
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_action text,
  p_severity text DEFAULT 'info',
  p_target_table text DEFAULT NULL,
  p_target_record_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_profile RECORD;
BEGIN
  SELECT id, role, admin_id INTO v_profile
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.security_audit_log (
    event_type, action, severity, actor_user_id, actor_profile_id, actor_role,
    admin_id, target_table, target_record_id, details
  ) VALUES (
    p_event_type,
    p_action,
    COALESCE(p_severity, 'info'),
    auth.uid(),
    v_profile.id,
    v_profile.role::text,
    CASE WHEN v_profile.role::text = 'admin' THEN v_profile.id ELSE v_profile.admin_id END,
    p_target_table,
    p_target_record_id,
    COALESCE(p_details, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) TO authenticated;

-- 3. Session epoch for automatic revocation on role/status change
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS security_epoch integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.audit_profile_security_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_sensitive boolean := false;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('from', OLD.role, 'to', NEW.role));
    v_sensitive := true;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
    v_sensitive := true;
  END IF;
  IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN
    v_changes := v_changes || jsonb_build_object('admin_id', jsonb_build_object('from', OLD.admin_id, 'to', NEW.admin_id));
    v_sensitive := true;
  END IF;

  IF v_sensitive THEN
    NEW.security_epoch := COALESCE(OLD.security_epoch, 0) + 1;

    INSERT INTO public.security_audit_log (
      event_type, action, severity, actor_user_id, actor_role,
      admin_id, target_table, target_record_id, details
    ) VALUES (
      'authorization', 'profile_security_change', 'warning', auth.uid(),
      public.get_my_role()::text,
      CASE WHEN NEW.role::text = 'admin' THEN NEW.id ELSE NEW.admin_id END,
      'profiles', NEW.id::text,
      v_changes || jsonb_build_object('target_user_id', NEW.user_id, 'epoch', NEW.security_epoch)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_security ON public.profiles;
CREATE TRIGGER trg_audit_profile_security
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_security_changes();

-- 4. Audit permission grants/revocations and bump the target user's epoch
CREATE OR REPLACE FUNCTION public.audit_user_permission_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  v_row := COALESCE(NEW, OLD);

  INSERT INTO public.security_audit_log (
    event_type, action, severity, actor_user_id, actor_role,
    target_table, target_record_id, details
  ) VALUES (
    'authorization',
    lower(TG_OP) || '_permission',
    'warning',
    auth.uid(),
    public.get_my_role()::text,
    'user_permissions',
    v_row.id::text,
    to_jsonb(v_row)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_permissions ON public.user_permissions;
CREATE TRIGGER trg_audit_user_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_user_permission_changes();

-- 5. Session epoch reader for clients
CREATE OR REPLACE FUNCTION public.get_my_security_epoch()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(security_epoch, 0) FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_security_epoch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_security_epoch() TO authenticated;
