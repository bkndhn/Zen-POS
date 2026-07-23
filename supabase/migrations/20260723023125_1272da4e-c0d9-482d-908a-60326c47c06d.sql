
CREATE OR REPLACE FUNCTION public.get_public_feedback_form(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(jsonb_agg(to_jsonb(f) - 'created_at' ORDER BY f.display_order), '[]'::jsonb)
    INTO v_fields
  FROM (
    SELECT id, field_key, label, placeholder, helper_text, field_type, options, validation, is_required, display_order, created_at
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
$function$;
