
-- 1) feedback_forms
CREATE TABLE public.feedback_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'We''d love your feedback',
  subtitle text,
  thank_you_message text NOT NULL DEFAULT 'Thank you for your feedback!',
  submit_button_label text NOT NULL DEFAULT 'Submit Feedback',
  show_shop_header boolean NOT NULL DEFAULT true,
  header_logo_url text,
  primary_color text NOT NULL DEFAULT '#3b82f6',
  background_color text NOT NULL DEFAULT '#ffffff',
  text_color text NOT NULL DEFAULT '#0f172a',
  font_family text NOT NULL DEFAULT 'Inter',
  border_radius text NOT NULL DEFAULT '12px',
  layout_style text NOT NULL DEFAULT 'card',
  cooldown_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_reply_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_forms TO authenticated;
GRANT ALL ON public.feedback_forms TO service_role;
ALTER TABLE public.feedback_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_forms_read" ON public.feedback_forms FOR SELECT TO authenticated
USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "feedback_forms_write" ON public.feedback_forms FOR ALL TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id))
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));

-- 2) feedback_form_fields
CREATE TABLE public.feedback_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  field_key text NOT NULL,
  label text NOT NULL,
  placeholder text,
  helper_text text,
  field_type text NOT NULL CHECK (field_type IN ('text','long_text','number','date','dropdown','radio','checkbox','rating','email','phone','yes_no')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, field_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_form_fields TO authenticated;
GRANT ALL ON public.feedback_form_fields TO service_role;
ALTER TABLE public.feedback_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_form_fields_read" ON public.feedback_form_fields FOR SELECT TO authenticated
USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "feedback_form_fields_write" ON public.feedback_form_fields FOR ALL TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id))
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));

-- 3) feedback_submissions
CREATE TABLE public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.feedback_forms(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  customer_mobile text NOT NULL,
  customer_name text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_rating numeric,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','replied','resolved','ignored','needs_attention')),
  reply_notes text,
  replied_at timestamptz,
  replied_by uuid,
  session_id text,
  ip_hash text,
  user_agent text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_submissions_admin_branch ON public.feedback_submissions(admin_id, branch_id, submitted_at DESC);
CREATE INDEX idx_feedback_submissions_mobile ON public.feedback_submissions(branch_id, customer_mobile, submitted_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_submissions TO authenticated;
GRANT ALL ON public.feedback_submissions TO service_role;
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_submissions_read" ON public.feedback_submissions FOR SELECT TO authenticated
USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "feedback_submissions_update" ON public.feedback_submissions FOR UPDATE TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id))
WITH CHECK (public.has_branch_write_access(admin_id, branch_id));
CREATE POLICY "feedback_submissions_delete" ON public.feedback_submissions FOR DELETE TO authenticated
USING (public.has_branch_write_access(admin_id, branch_id));

-- updated_at triggers
CREATE TRIGGER trg_feedback_forms_updated BEFORE UPDATE ON public.feedback_forms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_feedback_form_fields_updated BEFORE UPDATE ON public.feedback_form_fields
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_feedback_submissions_updated BEFORE UPDATE ON public.feedback_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_submissions;

-- 4) Public RPCs

-- Get form + fields by slug (respects allow_feedback_module client permission and is_active)
CREATE OR REPLACE FUNCTION public.get_public_feedback_form(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.feedback_forms%ROWTYPE;
  v_allow boolean;
  v_shop jsonb;
  v_fields jsonb;
BEGIN
  SELECT * INTO v_form FROM public.feedback_forms WHERE slug = p_slug AND is_active = true LIMIT 1;
  IF v_form.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE((client_permissions->>'allow_feedback_module')::boolean, false) INTO v_allow
  FROM public.profiles WHERE id = v_form.admin_id;
  IF NOT v_allow THEN RETURN NULL; END IF;

  v_shop := public.get_public_shop_settings_for_branch(v_form.admin_id, v_form.branch_id);

  SELECT COALESCE(jsonb_agg(f ORDER BY f.display_order, f.created_at), '[]'::jsonb) INTO v_fields
  FROM (
    SELECT id, field_key, label, placeholder, helper_text, field_type, options, validation, is_required, display_order
    FROM public.feedback_form_fields
    WHERE form_id = v_form.id AND is_active = true
    ORDER BY display_order, created_at
  ) f;

  RETURN jsonb_build_object(
    'form', to_jsonb(v_form) - 'whatsapp_reply_templates',
    'fields', v_fields,
    'shop', v_shop
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_feedback_form(text) TO anon, authenticated;

-- Submit feedback (anonymous). Enforces cooldown + rate limits.
CREATE OR REPLACE FUNCTION public.submit_public_feedback(
  p_slug text,
  p_mobile text,
  p_customer_name text,
  p_responses jsonb,
  p_session_id text,
  p_user_agent text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.feedback_forms%ROWTYPE;
  v_allow boolean;
  v_recent int;
  v_last timestamptz;
  v_rating numeric;
  v_status text := 'new';
  v_sub_id uuid;
BEGIN
  IF p_mobile IS NULL OR p_mobile !~ '^[6-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_mobile');
  END IF;

  SELECT * INTO v_form FROM public.feedback_forms WHERE slug = p_slug AND is_active = true LIMIT 1;
  IF v_form.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT COALESCE((client_permissions->>'allow_feedback_module')::boolean, false) INTO v_allow
  FROM public.profiles WHERE id = v_form.admin_id;
  IF NOT v_allow THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;

  -- Cooldown: same mobile + branch within cooldown_days
  SELECT MAX(submitted_at) INTO v_last FROM public.feedback_submissions
   WHERE branch_id = v_form.branch_id AND customer_mobile = p_mobile;
  IF v_last IS NOT NULL AND v_last > (now() - (v_form.cooldown_days || ' days')::interval) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'next_allowed_at', v_last + (v_form.cooldown_days || ' days')::interval);
  END IF;

  -- Session rate limit: max 3 per session per hour
  IF p_session_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent FROM public.feedback_submissions
     WHERE session_id = p_session_id AND created_at > now() - interval '1 hour';
    IF v_recent >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  -- Derive overall rating: first numeric rating-type field response, if any
  SELECT (p_responses->>f.field_key)::numeric INTO v_rating
    FROM public.feedback_form_fields f
   WHERE f.form_id = v_form.id AND f.field_type = 'rating' AND f.is_active
   ORDER BY f.display_order LIMIT 1;

  IF v_rating IS NOT NULL AND v_rating <= 2 THEN v_status := 'needs_attention'; END IF;

  INSERT INTO public.feedback_submissions (
    form_id, admin_id, branch_id, customer_mobile, customer_name, responses,
    overall_rating, status, session_id, user_agent
  ) VALUES (
    v_form.id, v_form.admin_id, v_form.branch_id, p_mobile, NULLIF(p_customer_name,''),
    COALESCE(p_responses, '{}'::jsonb), v_rating, v_status, p_session_id, p_user_agent
  ) RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object('ok', true, 'id', v_sub_id, 'thank_you', v_form.thank_you_message);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_public_feedback(text, text, text, jsonb, text, text) TO anon, authenticated;
