-- ============================================================
-- Complete FCM Implementation - All Notification Types
-- ============================================================

-- ── New shop_settings columns for alert controls ─────────────
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS khata_dues_alert_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS khata_dues_threshold NUMERIC DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS revenue_milestone_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_milestone_amount NUMERIC DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS slow_day_alert_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slow_day_alert_hour INTEGER DEFAULT 14;

-- ── 1. Enhanced Low Stock trigger ────────────────────────────
-- Uses per-item minimum_stock_alert threshold instead of hardcoded 5
CREATE OR REPLACE FUNCTION public.trigger_push_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_threshold NUMERIC;
  v_branch_name TEXT;
  v_unit TEXT;
BEGIN
  v_threshold := COALESCE(NEW.minimum_stock_alert, 5);

  IF COALESCE(NEW.unlimited_stock, false) = true THEN RETURN NEW; END IF;

  IF NEW.stock_quantity IS NOT NULL
     AND NEW.stock_quantity <= v_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity > v_threshold)
  THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    v_branch_name := COALESCE(v_branch_name, 'Main Branch');
    v_unit := CASE WHEN NEW.stock_quantity = 1 THEN 'unit' ELSE 'units' END;

    PERFORM public.notify_by_permission(
      NEW.admin_id, NEW.branch_id, 'stock',
      'Low Stock: ' || COALESCE(NEW.name, 'Item'),
      v_branch_name || ' — only ' || NEW.stock_quantity::TEXT || ' ' || v_unit || ' left. Restock soon!',
      jsonb_build_object('type', 'low_stock', 'url', '/stock', 'item_id', NEW.id, 'item_name', NEW.name)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_low_stock failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

-- ── 2. Enhanced Online Order trigger ─────────────────────────
-- Adds item list preview, order type label, improved formatting
CREATE OR REPLACE FUNCTION public.trigger_push_new_remote_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_branch_name TEXT;
  v_items_preview TEXT;
  v_item_count INTEGER;
  v_order_label TEXT;
BEGIN
  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
  v_branch_name := COALESCE(v_branch_name, 'Main Branch');

  SELECT COUNT(*), STRING_AGG(item->>'name', ', ' ORDER BY (item->>'name'))
  INTO v_item_count, v_items_preview
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item;

  IF LENGTH(v_items_preview) > 60 THEN
    v_items_preview := LEFT(v_items_preview, 57) || '...';
  END IF;

  v_order_label := CASE COALESCE(NEW.order_type, 'delivery')
    WHEN 'pickup'   THEN 'Pickup'
    WHEN 'dine_in'  THEN 'Dine-in'
    ELSE 'Delivery'
  END;

  PERFORM public.notify_by_permission(
    NEW.admin_id, NEW.branch_id, 'onlineOrders',
    'New ' || v_order_label || ': Rs.' || ROUND(COALESCE(NEW.total_amount, 0)) || ' - ' || v_branch_name,
    COALESCE(NEW.customer_name, 'Customer') || ' · ' || v_item_count || ' items' ||
      CASE WHEN v_items_preview IS NOT NULL THEN E'\n' || v_items_preview ELSE '' END,
    jsonb_build_object('type', 'new_remote_order', 'url', '/online-orders', 'order_id', NEW.id, 'order_type', NEW.order_type)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_new_remote_order failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

-- ── 3. Enhanced Service Request trigger ──────────────────────
-- Emoji by request type, seat label, custom message
CREATE OR REPLACE FUNCTION public.trigger_push_service_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_branch_name TEXT;
  v_emoji TEXT;
  v_location TEXT;
BEGIN
  SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
  v_branch_name := COALESCE(v_branch_name, 'Main Branch');

  v_emoji := CASE LOWER(COALESCE(NEW.request_type, ''))
    WHEN 'water'   THEN 'Water'
    WHEN 'bill'    THEN 'Bill'
    WHEN 'waiter'  THEN 'Waiter'
    WHEN 'help'    THEN 'Help'
    WHEN 'cleanup' THEN 'Cleanup'
    WHEN 'food'    THEN 'Food'
    ELSE 'Service'
  END;

  v_location := CASE
    WHEN NEW.seat_label IS NOT NULL THEN 'Seat ' || NEW.seat_label
    ELSE 'Table ' || COALESCE(NEW.table_number, '?')
  END;

  PERFORM public.notify_by_permission(
    NEW.admin_id, NEW.branch_id, 'serviceArea',
    INITCAP(COALESCE(NEW.request_type, 'Service')) || ' Request — ' || v_location,
    v_branch_name || ' · ' || v_location || ' needs ' || LOWER(COALESCE(NEW.request_type, 'service')) ||
      CASE WHEN NEW.message IS NOT NULL AND NEW.message != '' THEN E'\n"' || NEW.message || '"' ELSE '' END,
    jsonb_build_object('type', 'service_request', 'url', '/service-area', 'table', NEW.table_number, 'seat', NEW.seat_label, 'request_type', NEW.request_type)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_service_request failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

-- ── 4. Enhanced Order Ready trigger ──────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_push_order_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_branch_name TEXT;
  v_customer_fcm TEXT;
  v_table_label TEXT;
BEGIN
  IF NEW.kitchen_status = 'ready' AND (OLD.kitchen_status IS DISTINCT FROM 'ready') THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    v_branch_name := COALESCE(v_branch_name, 'Main Branch');
    v_table_label := COALESCE(NEW.table_no, 'Counter');

    PERFORM public.notify_by_permission(
      NEW.admin_id, NEW.branch_id, 'serviceArea',
      'Ready to Serve — Table ' || v_table_label,
      'Bill #' || COALESCE(NEW.bill_no::TEXT, '') || ' at ' || v_branch_name || ' is ready for Table ' || v_table_label,
      jsonb_build_object('type', 'order_ready', 'url', '/service-area', 'bill_id', NEW.id)
    );

    SELECT customer_fcm_token INTO v_customer_fcm FROM table_orders WHERE bill_id = NEW.id LIMIT 1;
    IF v_customer_fcm IS NULL THEN
      SELECT customer_fcm_token INTO v_customer_fcm FROM remote_orders WHERE bill_id = NEW.id LIMIT 1;
    END IF;

    IF v_customer_fcm IS NOT NULL THEN
      INSERT INTO push_queue (user_id, token, title, body, data)
      VALUES (
        NEW.admin_id,
        v_customer_fcm,
        'Your order is ready!',
        'Your food is ready at ' || v_branch_name || '. Please collect from the counter.',
        jsonb_build_object('type', 'order_ready', 'bill_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_order_ready failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

-- ── 5. NEW: Khata Dues Alert ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_push_khata_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_settings RECORD;
  v_auth_uid UUID;
  v_threshold NUMERIC;
  v_branch_name TEXT;
BEGIN
  SELECT user_id INTO v_auth_uid FROM profiles WHERE id = NEW.admin_id LIMIT 1;
  IF v_auth_uid IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM shop_settings WHERE user_id = v_auth_uid LIMIT 1;
  IF NOT COALESCE(v_settings.fcm_unlocked, false) OR NOT COALESCE(v_settings.fcm_enabled, false) THEN RETURN NEW; END IF;
  IF NOT COALESCE(v_settings.khata_dues_alert_enabled, true) THEN RETURN NEW; END IF;

  v_threshold := COALESCE(v_settings.khata_dues_threshold, 1000);

  IF COALESCE(NEW.khata_balance, 0) >= v_threshold
     AND COALESCE(OLD.khata_balance, 0) < v_threshold
  THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      v_auth_uid,
      'High Dues: ' || COALESCE(NEW.name, 'Customer'),
      COALESCE(NEW.name, 'A customer') || ' Khata balance Rs.' || ROUND(NEW.khata_balance) ||
        COALESCE(' at ' || v_branch_name, '') || '. Collect payment!',
      jsonb_build_object('type', 'khata_due', 'url', '/crm', 'customer_id', NEW.id, 'balance', NEW.khata_balance)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_khata_due failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_push_khata_due ON customers;
CREATE TRIGGER trg_push_khata_due
  AFTER UPDATE OF khata_balance ON customers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_khata_due();

-- ── 6. NEW: Revenue Milestone trigger ────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_push_revenue_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_auth_uid UUID;
  v_settings RECORD;
  v_milestone NUMERIC;
  v_today_total_before NUMERIC;
  v_today_total_after NUMERIC;
  v_crossed_milestone NUMERIC;
  v_branch_name TEXT;
BEGIN
  IF TG_OP != 'INSERT' OR COALESCE(NEW.total_amount, 0) = 0 THEN RETURN NEW; END IF;
  IF NEW.created_at < (NOW() - INTERVAL '10 minutes') THEN RETURN NEW; END IF;

  SELECT user_id INTO v_auth_uid FROM profiles WHERE id = NEW.admin_id LIMIT 1;
  IF v_auth_uid IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM shop_settings WHERE user_id = v_auth_uid LIMIT 1;
  IF NOT COALESCE(v_settings.fcm_unlocked, false) OR NOT COALESCE(v_settings.fcm_enabled, false) THEN RETURN NEW; END IF;
  IF NOT COALESCE(v_settings.revenue_milestone_enabled, false) THEN RETURN NEW; END IF;

  v_milestone := COALESCE(v_settings.revenue_milestone_amount, 10000);

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_today_total_before
  FROM bills
  WHERE admin_id = NEW.admin_id AND is_deleted = false AND created_at::date = CURRENT_DATE AND id != NEW.id;

  v_today_total_after := v_today_total_before + COALESCE(NEW.total_amount, 0);

  v_crossed_milestone := FLOOR(v_today_total_after / v_milestone) * v_milestone;
  IF v_crossed_milestone > 0 AND v_crossed_milestone > FLOOR(v_today_total_before / v_milestone) * v_milestone THEN
    SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id LIMIT 1;
    v_branch_name := COALESCE(v_branch_name, 'your restaurant');

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      v_auth_uid,
      'Rs.' || ROUND(v_crossed_milestone) || ' milestone hit!',
      'Daily revenue at ' || v_branch_name || ' just crossed Rs.' || ROUND(v_crossed_milestone) || '. Keep going!',
      jsonb_build_object('type', 'revenue_milestone', 'url', '/reports', 'milestone', v_crossed_milestone)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_revenue_milestone failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_push_revenue_milestone ON bills;
CREATE TRIGGER trg_push_revenue_milestone
  AFTER INSERT ON bills
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_revenue_milestone();

-- ── 7. NEW: Slow Day Alert (hourly cron function) ─────────────
CREATE OR REPLACE FUNCTION public.generate_slow_day_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_admin RECORD;
  v_bill_count INTEGER;
  v_today DATE := CURRENT_DATE;
  v_current_hour INTEGER := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::INTEGER;
BEGIN
  FOR v_admin IN
    SELECT ss.user_id, p.id AS admin_profile_id, ss.slow_day_alert_hour
    FROM shop_settings ss
    JOIN profiles p ON p.user_id = ss.user_id
    WHERE ss.fcm_unlocked = true AND ss.fcm_enabled = true AND ss.slow_day_alert_enabled = true AND p.role = 'admin'
  LOOP
    IF v_current_hour != COALESCE(v_admin.slow_day_alert_hour, 14) THEN CONTINUE; END IF;

    SELECT COUNT(*) INTO v_bill_count
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id AND is_deleted = false AND created_at::date = v_today;

    IF v_bill_count = 0 THEN
      INSERT INTO push_queue (user_id, title, body, data)
      VALUES (
        v_admin.user_id,
        'No orders yet today',
        'Your restaurant has 0 bills today. Check if everything is running fine.',
        jsonb_build_object('type', 'slow_day', 'url', '/reports')
      );
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'generate_slow_day_alerts failed: %', SQLERRM;
END;
$func$;

-- Schedule slow day alert hourly
SELECT cron.unschedule('slow-day-alert') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slow-day-alert');
SELECT cron.schedule('slow-day-alert', '0 * * * *', 'SELECT public.generate_slow_day_alerts();');
