-- ============================================================
-- FCM Enhanced Notifications
-- 1. trigger_push_new_bill: Branch name in title, payment mode,
--    order type (Dine-in/Parcel/Online) in notification body
-- 2. generate_daily_summaries: Per-branch breakdown, payment
--    mode totals (Cash/UPI/Card), top selling item
-- ============================================================

-- ── 1. Enhanced bill push trigger ──────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_push_new_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_branch_id UUID;
  v_branch_name TEXT;
  v_settings RECORD;
  v_total NUMERIC;
  v_bill_no TEXT;
  v_time_str TEXT;
  v_order_type TEXT;
  v_payment_mode TEXT;
  v_body TEXT;
BEGIN
  -- Skip bills older than 10 minutes (synced offline batches)
  IF NEW.created_at < (NOW() - INTERVAL '10 minutes') THEN
    RETURN NEW;
  END IF;

  -- On INSERT: skip if total_amount is 0
  IF TG_OP = 'INSERT' AND COALESCE(NEW.total_amount, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: only fire when total_amount transitions from 0 to >0
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.total_amount, 0) > 0 THEN RETURN NEW; END IF;
    IF COALESCE(NEW.total_amount, 0) = 0 THEN RETURN NEW; END IF;
  END IF;

  v_admin_id     := NEW.admin_id;
  v_branch_id    := NEW.branch_id;
  v_total        := COALESCE(NEW.total_amount, 0);
  v_bill_no      := COALESCE(NEW.bill_no, NEW.id::TEXT);
  v_time_str     := TO_CHAR(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'hh12:MI AM');
  v_payment_mode := INITCAP(COALESCE(NEW.payment_mode::text, 'cash'));

  -- Order type label
  v_order_type := CASE COALESCE(NEW.order_type, 'dine_in')
    WHEN 'parcel'  THEN 'Parcel'
    WHEN 'online'  THEN 'Online'
    ELSE 'Dine-in'
  END;

  -- Get branch name
  SELECT name INTO v_branch_name FROM branches WHERE id = v_branch_id LIMIT 1;
  v_branch_name := COALESCE(v_branch_name, 'Main Branch');

  -- Get shop settings
  SELECT s.* INTO v_settings
  FROM shop_settings s
  WHERE s.user_id = (SELECT user_id FROM profiles WHERE id = v_admin_id LIMIT 1)
  LIMIT 1;

  -- Kitchen staff alert
  IF v_settings.fcm_unlocked = true AND v_settings.fcm_enabled = true THEN
    PERFORM public.notify_by_permission(
      v_admin_id,
      v_branch_id,
      'kitchen',
      'New Order - ' || v_branch_name,
      '#' || v_bill_no || ' | Rs.' || ROUND(v_total) || ' | ' || v_order_type || ' | ' || v_time_str,
      jsonb_build_object('type', 'new_bill', 'bill_id', NEW.id, 'url', '/kitchen')
    );
  END IF;

  -- Owner live bill push
  IF v_settings.live_bill_push_unlocked = true AND v_settings.live_bill_push_enabled = true THEN
    -- Title: amount + branch name (visible on lock screen without unlocking phone)
    -- Body:  order type + payment mode + time + bill number
    v_body := v_order_type || ' | ' || v_payment_mode || ' | ' || v_time_str || E'\n'
           || 'Bill #' || v_bill_no || ' @ ' || v_branch_name;

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      (SELECT user_id FROM profiles WHERE id = v_admin_id LIMIT 1),
      'Rs.' || ROUND(v_total) || ' - ' || v_branch_name,
      v_body,
      jsonb_build_object(
        'type', 'live_bill',
        'bill_id', NEW.id,
        'branch_name', v_branch_name,
        'order_type', NEW.order_type,
        'payment_mode', NEW.payment_mode::text,
        'url', '/reports'
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_new_bill failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 2. Enhanced daily summary with per-branch & payment breakdown ──
CREATE OR REPLACE FUNCTION public.generate_daily_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin RECORD;
  v_branch RECORD;
  v_summary TEXT;
  v_total_sales NUMERIC;
  v_bill_count INTEGER;
  v_top_item TEXT;
  v_cash_total NUMERIC;
  v_upi_total NUMERIC;
  v_card_total NUMERIC;
  v_other_total NUMERIC;
  v_branch_lines TEXT;
  v_branch_total NUMERIC;
  v_branch_bills INTEGER;
  v_branch_count INTEGER;
  v_pay_parts TEXT;
  v_today DATE := CURRENT_DATE;
BEGIN
  FOR v_admin IN
    SELECT ss.user_id, p.id AS admin_profile_id, ss.daily_summary_time
    FROM shop_settings ss
    JOIN profiles p ON p.user_id = ss.user_id
    WHERE ss.fcm_unlocked = true
      AND ss.fcm_enabled = true
      AND ss.daily_summary_time IS NOT NULL
      AND ss.daily_summary_time != 'off'
      AND ss.daily_summary_time = TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
      AND p.role = 'admin'
  LOOP
    -- Overall totals
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_bill_count
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id
      AND is_deleted = false
      AND created_at::date = v_today;

    -- Payment breakdown
    SELECT
      COALESCE(SUM(CASE WHEN payment_mode::text = 'cash'  THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'upi'   THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'card'  THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'other' THEN total_amount ELSE 0 END), 0)
    INTO v_cash_total, v_upi_total, v_card_total, v_other_total
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id
      AND is_deleted = false
      AND created_at::date = v_today;

    -- Top selling item
    SELECT bi.item_name
    INTO v_top_item
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.admin_id = v_admin.admin_profile_id
      AND b.is_deleted = false
      AND b.created_at::date = v_today
    GROUP BY bi.item_name
    ORDER BY SUM(bi.quantity) DESC
    LIMIT 1;

    -- Count branches with sales today
    SELECT COUNT(DISTINCT branch_id)
    INTO v_branch_count
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id
      AND is_deleted = false
      AND created_at::date = v_today;

    -- Main summary line (title-like info in body)
    v_summary := 'Total: Rs.' || ROUND(v_total_sales) || ' | ' || v_bill_count || ' bills';

    -- Payment breakdown line
    IF v_bill_count > 0 THEN
      v_pay_parts := '';
      IF v_cash_total  > 0 THEN v_pay_parts := v_pay_parts || 'Cash: Rs.' || ROUND(v_cash_total)  || '  '; END IF;
      IF v_upi_total   > 0 THEN v_pay_parts := v_pay_parts || 'UPI: Rs.'  || ROUND(v_upi_total)   || '  '; END IF;
      IF v_card_total  > 0 THEN v_pay_parts := v_pay_parts || 'Card: Rs.' || ROUND(v_card_total)  || '  '; END IF;
      IF v_other_total > 0 THEN v_pay_parts := v_pay_parts || 'Other: Rs.'|| ROUND(v_other_total); END IF;
      IF v_pay_parts != '' THEN
        v_summary := v_summary || E'\n' || TRIM(v_pay_parts);
      END IF;
    END IF;

    -- Per-branch breakdown (only when multiple branches had sales)
    IF v_branch_count > 1 THEN
      v_branch_lines := '';
      FOR v_branch IN
        SELECT br.name, br.id
        FROM branches br
        WHERE br.admin_id = v_admin.admin_profile_id
        ORDER BY br.is_main DESC, br.name ASC
      LOOP
        SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
        INTO v_branch_total, v_branch_bills
        FROM bills
        WHERE admin_id = v_admin.admin_profile_id
          AND branch_id = v_branch.id
          AND is_deleted = false
          AND created_at::date = v_today;

        IF v_branch_bills > 0 THEN
          v_branch_lines := v_branch_lines
            || E'\n' || v_branch.name || ': Rs.' || ROUND(v_branch_total) || ' (' || v_branch_bills || ' bills)';
        END IF;
      END LOOP;
      IF v_branch_lines != '' THEN
        v_summary := v_summary || v_branch_lines;
      END IF;
    END IF;

    -- Top item
    IF v_top_item IS NOT NULL THEN
      v_summary := v_summary || E'\n' || 'Top item: ' || v_top_item;
    END IF;

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      v_admin.user_id,
      'Daily Summary - ' || TO_CHAR(v_today, 'DD Mon') || ' | Rs.' || ROUND(v_total_sales),
      v_summary,
      jsonb_build_object('url', '/reports', 'type', 'daily_summary')
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Daily summary generation failed: %', SQLERRM;
END;
$$;
