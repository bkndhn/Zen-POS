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
      'bill_no', NEW.bill_no,
      'total', NEW.total_amount,
      'payment_mode', NEW.payment_mode,
      'branch_id', NEW.branch_id,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_bill_webhook() FROM PUBLIC, anon, authenticated;