CREATE TABLE IF NOT EXISTS private.report_pin_unlocks (
  user_id uuid NOT NULL,
  scope_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, scope_key)
);
REVOKE ALL ON private.report_pin_unlocks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_report_pin(p_branch_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, extensions AS $$
DECLARE v_admin uuid := public.get_user_admin_id(); v_hash text; v_ok boolean;
BEGIN
  IF v_admin IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
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

-- True when the caller may read historical bills of this tenant/branch.
CREATE OR REPLACE FUNCTION public.can_read_report_bills(p_admin_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT
    -- shop owner
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.id = p_admin_id AND p.role = 'admin')
    -- no PIN configured for this tenant
    OR NOT EXISTS (SELECT 1 FROM private.report_pins rp WHERE rp.admin_id = p_admin_id)
    -- active unlock for this branch or all branches
    OR EXISTS (SELECT 1 FROM private.report_pin_unlocks u
               WHERE u.user_id = auth.uid() AND u.expires_at > now()
                 AND u.scope_key IN ('all', coalesce(p_branch_id::text, 'all')))
$$;
REVOKE ALL ON FUNCTION public.can_read_report_bills(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_report_bills(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS bills_select ON public.bills;
DROP POLICY IF EXISTS bills_modify ON public.bills;

CREATE POLICY bills_select ON public.bills FOR SELECT TO authenticated
USING (
  public.has_branch_read_access(admin_id, branch_id)
  AND (
    created_by = auth.uid()
    OR created_at >= now() - interval '2 days'
    OR public.can_read_report_bills(admin_id, branch_id)
  )
);
CREATE POLICY bills_insert ON public.bills FOR INSERT TO authenticated
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));
CREATE POLICY bills_update ON public.bills FOR UPDATE TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id))
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));
CREATE POLICY bills_delete ON public.bills FOR DELETE TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id));