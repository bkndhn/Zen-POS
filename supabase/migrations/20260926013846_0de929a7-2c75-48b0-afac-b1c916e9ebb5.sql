-- 1. Deep-link anti-theft pushes to the security alerts page
CREATE OR REPLACE FUNCTION public.fire_antitheft_alert(p_admin_id uuid, p_branch_id uuid, p_alert_type text, p_severity text, p_bill_id uuid, p_bill_no text, p_amount numeric, p_cashier_name text, p_cashier_uid uuid, p_title text, p_body text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid UUID;
  v_settings RECORD;
  v_alert_id UUID;
BEGIN
  SELECT user_id INTO v_auth_uid FROM profiles WHERE id = p_admin_id LIMIT 1;
  IF v_auth_uid IS NULL THEN RETURN; END IF;

  SELECT * INTO v_settings FROM shop_settings
  WHERE user_id = v_auth_uid AND branch_id = p_branch_id LIMIT 1;
  IF v_settings IS NULL THEN
    SELECT * INTO v_settings FROM shop_settings WHERE user_id = v_auth_uid LIMIT 1;
  END IF;

  IF NOT COALESCE(v_settings.fcm_unlocked, false) THEN RETURN; END IF;
  IF NOT COALESCE(v_settings.fcm_enabled, false) THEN RETURN; END IF;
  IF NOT COALESCE(v_settings.antitheft_enabled, true) THEN RETURN; END IF;

  INSERT INTO anti_theft_alerts
    (admin_id, branch_id, alert_type, severity, bill_id, bill_no, amount, cashier_name, cashier_user_id, details)
  VALUES
    (p_admin_id, p_branch_id, p_alert_type, p_severity, p_bill_id, p_bill_no, p_amount, p_cashier_name, p_cashier_uid, p_details)
  RETURNING id INTO v_alert_id;

  INSERT INTO push_queue (user_id, title, body, data)
  SELECT v_auth_uid, p_title, p_body,
    jsonb_build_object(
      'type', 'anti_theft_alert',
      'alert_type', p_alert_type,
      'severity', p_severity,
      'bill_id', p_bill_id,
      'alert_id', v_alert_id,
      'url', '/security?alert_id=' || v_alert_id::text
    )
  WHERE
    EXISTS (SELECT 1 FROM user_devices ud WHERE ud.user_id = v_auth_uid AND ud.enabled = true AND COALESCE(ud.fcm_muted, false) = false)
    AND NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = v_auth_uid AND (pr.push_preferences->>'anti_theft_alert')::text = 'false');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fire_antitheft_alert failed: %', SQLERRM;
END;
$function$;

-- 2. Outbound webhook endpoints
CREATE TABLE public.client_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  events text[] NOT NULL DEFAULT ARRAY['bill.created','bill.voided','payment.success'],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_webhook_endpoints TO authenticated;
GRANT ALL ON public.client_webhook_endpoints TO service_role;
ALTER TABLE public.client_webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook endpoints tenant access"
ON public.client_webhook_endpoints FOR ALL TO authenticated
USING (admin_id = public.get_my_admin_id())
WITH CHECK (admin_id = public.get_my_admin_id());

CREATE TABLE public.client_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  endpoint_id uuid REFERENCES public.client_webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  response_body text,
  duration_ms integer,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_webhook_logs TO authenticated;
GRANT ALL ON public.client_webhook_logs TO service_role;
ALTER TABLE public.client_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook logs tenant read"
ON public.client_webhook_logs FOR SELECT TO authenticated
USING (admin_id = public.get_my_admin_id());

CREATE INDEX idx_webhook_logs_admin_created ON public.client_webhook_logs (admin_id, created_at DESC);
CREATE INDEX idx_webhook_endpoints_admin ON public.client_webhook_endpoints (admin_id);

CREATE TRIGGER trg_webhook_endpoints_updated
BEFORE UPDATE ON public.client_webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Dispatcher: notify the edge function when an event occurs
CREATE OR REPLACE FUNCTION public.dispatch_client_webhook(p_admin_id uuid, p_branch_id uuid, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_admin_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM client_webhook_endpoints e
    WHERE e.admin_id = p_admin_id AND e.is_active = true AND p_event = ANY(e.events)
      AND (e.branch_id IS NULL OR e.branch_id = p_branch_id)
  ) THEN RETURN; END IF;

  PERFORM net.http_post(
    url := 'https://ivleyttlqlqawghvfyjz.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public.get_internal_secret()
    ),
    body := jsonb_build_object(
      'admin_id', p_admin_id,
      'branch_id', p_branch_id,
      'event', p_event,
      'payload', p_payload
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_client_webhook failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_bill_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'bill.created';
  ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.is_deleted,false) = false AND COALESCE(NEW.is_deleted,false) = true THEN
    v_event := 'bill.voided';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_client_webhook(
    NEW.admin_id, NEW.branch_id, v_event,
    jsonb_build_object(
      'bill_id', NEW.id,
      'bill_no', to_jsonb(NEW) ->> 'bill_number',
      'total', to_jsonb(NEW) ->> 'total_amount',
      'branch_id', NEW.branch_id,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bills_webhook ON public.bills;
CREATE TRIGGER trg_bills_webhook
AFTER INSERT OR UPDATE OF is_deleted ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.trg_bill_webhook();

CREATE OR REPLACE FUNCTION public.trg_payment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_status text; v_old text;
BEGIN
  v_status := lower(COALESCE(to_jsonb(NEW) ->> 'status', ''));
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN lower(COALESCE(to_jsonb(OLD) ->> 'status','')) ELSE '' END;
  IF v_status NOT IN ('success','paid','captured','completed') OR v_status = v_old THEN
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_client_webhook(
    (to_jsonb(NEW) ->> 'admin_id')::uuid,
    NULLIF(to_jsonb(NEW) ->> 'branch_id','')::uuid,
    'payment.success',
    jsonb_build_object(
      'payment_id', NEW.id,
      'amount', to_jsonb(NEW) ->> 'amount',
      'status', v_status,
      'created_at', to_jsonb(NEW) ->> 'created_at'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_transactions_webhook ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_webhook
AFTER INSERT OR UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_webhook();