ALTER TABLE public.table_orders ADD COLUMN IF NOT EXISTS customer_fcm_token text;
ALTER TABLE public.remote_orders ADD COLUMN IF NOT EXISTS customer_fcm_token text;

-- Update trigger to send notification to customer if they have an FCM token
CREATE OR REPLACE FUNCTION public.trigger_push_order_ready()
RETURNS TRIGGER AS $
DECLARE
  v_branch_name TEXT;
  v_customer_fcm TEXT;
BEGIN
  IF NEW.kitchen_status = 'ready' AND (OLD.kitchen_status IS DISTINCT FROM 'ready') THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    
    -- 1. Notify Service Area / Staff (Existing logic)
    PERFORM public.notify_by_permission(
      NEW.admin_id, NEW.branch_id, 'serviceArea',
      '? Order Ready ??? Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
      '[' || COALESCE(v_branch_name, 'Branch') || '] Table ' || COALESCE(NEW.table_no, '?') || ' order is ready to serve',
      jsonb_build_object('url', '/service-area', 'bill_id', NEW.id)
    );

    -- 2. Notify Customer (if they have an FCM token in table_orders or remote_orders)
    -- Check table_orders first
    SELECT customer_fcm_token INTO v_customer_fcm FROM table_orders WHERE bill_id = NEW.id LIMIT 1;
    
    -- If not found, check remote_orders
    IF v_customer_fcm IS NULL THEN
      SELECT customer_fcm_token INTO v_customer_fcm FROM remote_orders WHERE bill_id = NEW.id LIMIT 1;
    END IF;

    -- If customer FCM exists, push directly to them!
    IF v_customer_fcm IS NOT NULL THEN
       INSERT INTO push_queue (user_id, token, title, body, data)
       VALUES (
         NEW.admin_id,
         v_customer_fcm,
         'Your Order is Ready! ??',
         'Please collect your order at ' || COALESCE(v_branch_name, 'the counter') || '.',
         jsonb_build_object('type', 'order_ready', 'bill_id', NEW.id)
       );
    END IF;

  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
