-- Update all push triggers to include Branch Name and Item Name for robust KDS/Service alerts

CREATE OR REPLACE FUNCTION public.trigger_push_new_bill()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_uid UUID;
  v_unlocked BOOLEAN;
  v_enabled BOOLEAN;
  v_branch_name TEXT;
BEGIN
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- 0. Logic to prevent duplicates and handle 0-amount inserts from RPC
  IF TG_OP = 'INSERT' AND COALESCE(NEW.total_amount, 0) = 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.total_amount, 0) > 0 THEN
      RETURN NEW;
    END IF;
    IF COALESCE(NEW.total_amount, 0) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;

  -- 1. Notify kitchen (exclude admin by default from standard KDS alerts)
  PERFORM public.notify_by_permission(
    NEW.admin_id,
    NEW.branch_id,
    'kitchen',
    '🔔 New Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
    '[' || COALESCE(v_branch_name, 'Branch') || '] ' || COALESCE(NEW.order_type, 'dine_in') || ' bill for ₹' || COALESCE(NEW.total_amount::TEXT, '0'),
    jsonb_build_object('url', '/kitchen', 'bill_id', NEW.id),
    false
  );

  -- 2. Check special premium permission for Owner/Client Live Bill Alert
  SELECT user_id INTO v_admin_uid FROM profiles WHERE id = NEW.admin_id LIMIT 1;
  IF v_admin_uid IS NOT NULL THEN
    SELECT live_bill_push_unlocked, live_bill_push_enabled 
      INTO v_unlocked, v_enabled
    FROM shop_settings 
    WHERE user_id = v_admin_uid
      AND branch_id = NEW.branch_id
    LIMIT 1;

    IF v_unlocked IS NULL THEN
      SELECT live_bill_push_unlocked, live_bill_push_enabled 
        INTO v_unlocked, v_enabled
      FROM shop_settings 
      WHERE user_id = v_admin_uid
      LIMIT 1;
    END IF;

    IF v_unlocked = true AND v_enabled = true THEN
      INSERT INTO public.push_queue (user_id, title, body, data)
      VALUES (
        v_admin_uid,
        '💰 New Sale: ₹' || COALESCE(NEW.total_amount::TEXT, '0'),
        'Bill #' || COALESCE(NEW.bill_no::TEXT, '') || ' at ' || COALESCE(v_branch_name, 'Branch') || ' - ' || TO_CHAR(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
        jsonb_build_object('url', '/reports', 'bill_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.trigger_push_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_threshold NUMERIC := 5;
  v_branch_name TEXT;
BEGIN
  IF NEW.stock_quantity IS NOT NULL
     AND NEW.stock_quantity < v_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity >= v_threshold)
  THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    PERFORM public.notify_by_permission(
      NEW.admin_id, NEW.branch_id, 'stock',
      '⚠️ Low Stock: ' || COALESCE(NEW.name, 'Item'),
      '[' || COALESCE(v_branch_name, 'Branch') || '] ' || COALESCE(NEW.name, 'Item') || ' is running low — only ' || NEW.stock_quantity::TEXT || ' left',
      jsonb_build_object('url', '/stock', 'item_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.trigger_push_new_remote_order()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_name TEXT;
BEGIN
  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
  PERFORM public.notify_by_permission(
    NEW.admin_id, NEW.branch_id, 'onlineOrders',
    '🛒 New Online Order #' || COALESCE(NEW.order_number::TEXT, ''),
    '[' || COALESCE(v_branch_name, 'Branch') || '] Order from ' || COALESCE(NEW.customer_name, 'Customer') || ' - ₹' || COALESCE(NEW.total_amount::TEXT, '0'),
    jsonb_build_object('url', '/online-orders', 'order_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.trigger_push_order_ready()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_name TEXT;
BEGIN
  IF NEW.kitchen_status = 'ready' AND (OLD.kitchen_status IS DISTINCT FROM 'ready') THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    PERFORM public.notify_by_permission(
      NEW.admin_id, NEW.branch_id, 'serviceArea',
      '✅ Order Ready — Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
      '[' || COALESCE(v_branch_name, 'Branch') || '] Table ' || COALESCE(NEW.table_no, '?') || ' order is ready to serve',
      jsonb_build_object('url', '/service-area', 'bill_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.trigger_push_service_request()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_name TEXT;
BEGIN
  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
  PERFORM public.notify_by_permission(
    NEW.admin_id, NEW.branch_id, 'serviceArea',
    '🔔 Table ' || COALESCE(NEW.table_number, '?') || ' needs attention',
    '[' || COALESCE(v_branch_name, 'Branch') || '] ' || COALESCE(NEW.request_type, 'Service') || ' request from Table ' || COALESCE(NEW.table_number, '?'),
    jsonb_build_object('url', '/service-area', 'table', NEW.table_number)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
