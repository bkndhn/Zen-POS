-- lovable-cron-fallback-reviewed: summary must fire at the shop's chosen IST clock time; IST is offset 30 min from UTC so an hourly tick can never hit :00 IST
CREATE OR REPLACE FUNCTION public.generate_daily_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  v_now_ist TIMESTAMP := (NOW() AT TIME ZONE 'Asia/Kolkata');
  v_today DATE := v_now_ist::date;
  v_slot_start TEXT;
  v_slot_end TEXT;
BEGIN
  -- The cron runs every 30 minutes. Match any configured time that falls inside
  -- the 30-minute window that just elapsed, so 21:00 IST fires at 21:00 IST sharp
  -- (not at the next UTC-aligned hour, which is 21:30 IST).
  v_slot_start := TO_CHAR(date_trunc('hour', v_now_ist)
                  + (FLOOR(EXTRACT(MINUTE FROM v_now_ist) / 30) * INTERVAL '30 minutes'), 'HH24:MI');
  v_slot_end   := TO_CHAR(date_trunc('hour', v_now_ist)
                  + (FLOOR(EXTRACT(MINUTE FROM v_now_ist) / 30) * INTERVAL '30 minutes')
                  + INTERVAL '29 minutes', 'HH24:MI');

  FOR v_admin IN
    SELECT DISTINCT ON (ss.user_id)
      ss.user_id, p.id AS admin_profile_id, ss.daily_summary_time
    FROM shop_settings ss
    JOIN profiles p ON p.user_id = ss.user_id
    WHERE ss.fcm_unlocked = true
      AND ss.fcm_enabled = true
      AND ss.daily_summary_time IS NOT NULL
      AND ss.daily_summary_time <> 'off'
      AND (
        -- normalise legacy values like '21:00' and new values like '21:30'
        LPAD(SPLIT_PART(ss.daily_summary_time, ':', 1), 2, '0') || ':' ||
        LPAD(COALESCE(NULLIF(SPLIT_PART(ss.daily_summary_time, ':', 2), ''), '00'), 2, '0')
      ) BETWEEN v_slot_start AND v_slot_end
      AND p.role = 'admin'
    ORDER BY ss.user_id, ss.fcm_enabled DESC
  LOOP
    IF EXISTS (
      SELECT 1 FROM push_queue q
      WHERE q.user_id = v_admin.user_id
        AND (q.data->>'type') = 'daily_summary'
        AND (q.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_bill_count
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id AND is_deleted = false
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;

    SELECT
      COALESCE(SUM(CASE WHEN payment_mode::text = 'cash'  THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'upi'   THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'card'  THEN total_amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_mode::text = 'other' THEN total_amount ELSE 0 END), 0)
    INTO v_cash_total, v_upi_total, v_card_total, v_other_total
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id AND is_deleted = false
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;

    SELECT COALESCE(bi.item_name_override, i.name, 'Item') INTO v_top_item
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    LEFT JOIN items i ON i.id = bi.item_id
    WHERE b.admin_id = v_admin.admin_profile_id AND b.is_deleted = false
      AND (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today
    GROUP BY COALESCE(bi.item_name_override, i.name, 'Item')
    ORDER BY SUM(bi.quantity) DESC
    LIMIT 1;

    SELECT COUNT(DISTINCT branch_id) INTO v_branch_count
    FROM bills WHERE admin_id = v_admin.admin_profile_id AND is_deleted = false
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;

    v_summary := 'Total: Rs.' || ROUND(v_total_sales) || ' | ' || v_bill_count || ' bills';

    IF v_bill_count > 0 THEN
      DECLARE
        v_pay_parts TEXT := '';
      BEGIN
        IF v_cash_total  > 0 THEN v_pay_parts := v_pay_parts || 'Cash: Rs.' || ROUND(v_cash_total)  || '  '; END IF;
        IF v_upi_total   > 0 THEN v_pay_parts := v_pay_parts || 'UPI: Rs.'  || ROUND(v_upi_total)   || '  '; END IF;
        IF v_card_total  > 0 THEN v_pay_parts := v_pay_parts || 'Card: Rs.' || ROUND(v_card_total)  || '  '; END IF;
        IF v_other_total > 0 THEN v_pay_parts := v_pay_parts || 'Other: Rs.'|| ROUND(v_other_total); END IF;
        IF v_pay_parts <> '' THEN v_summary := v_summary || E'\n' || TRIM(v_pay_parts); END IF;
      END;
    END IF;

    IF v_branch_count > 1 THEN
      v_branch_lines := '';
      FOR v_branch IN
        SELECT br.name, br.id FROM branches br
        WHERE br.admin_id = v_admin.admin_profile_id ORDER BY br.is_main DESC, br.name ASC
      LOOP
        SELECT COALESCE(SUM(total_amount), 0), COUNT(*) INTO v_branch_total, v_branch_bills
        FROM bills WHERE admin_id = v_admin.admin_profile_id AND branch_id = v_branch.id
          AND is_deleted = false
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;
        IF v_branch_bills > 0 THEN
          v_branch_lines := v_branch_lines || E'\n' || v_branch.name || ': Rs.' || ROUND(v_branch_total) || ' (' || v_branch_bills || ' bills)';
        END IF;
      END LOOP;
      IF v_branch_lines <> '' THEN v_summary := v_summary || v_branch_lines; END IF;
    END IF;

    IF v_top_item IS NOT NULL THEN v_summary := v_summary || E'\n' || 'Top: ' || v_top_item; END IF;

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      v_admin.user_id,
      'Daily Summary - ' || TO_CHAR(v_today, 'DD Mon') || ' | Rs.' || ROUND(v_total_sales),
      v_summary,
      jsonb_build_object('url', '/reports', 'type', 'daily_summary')
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'generate_daily_summaries failed: %', SQLERRM;
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_daily_summaries() FROM PUBLIC, anon, authenticated;

-- Re-schedule so ticks land on :00 and :30 India time (UTC is offset by 30 minutes)
SELECT cron.unschedule('daily-sales-summary');
SELECT cron.schedule('daily-sales-summary', '0,30 * * * *', $$SELECT public.generate_daily_summaries();$$);

-- Slow-day alerts compare against the IST hour; align its tick to the IST hour too
SELECT cron.unschedule('slow-day-alert');
SELECT cron.schedule('slow-day-alert', '30 * * * *', $$SELECT public.generate_slow_day_alerts();$$);
