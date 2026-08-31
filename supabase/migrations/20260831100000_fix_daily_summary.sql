-- Fix: generate_daily_summaries was joining on wrong column
-- shop_settings has user_id (auth uid), NOT admin_id
-- profiles links via p.user_id = ss.user_id
CREATE OR REPLACE FUNCTION public.generate_daily_summaries()
RETURNS void AS $$
DECLARE
  v_admin RECORD;
  v_summary TEXT;
  v_total_sales NUMERIC;
  v_bill_count INTEGER;
  v_payment_modes TEXT;
  v_top_item TEXT;
  v_low_stock_count INTEGER;
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
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_bill_count
    FROM bills
    WHERE admin_id = v_admin.admin_profile_id
      AND is_deleted = false
      AND created_at::date = v_today;

    SELECT string_agg(mode_summary, ' | ')
    INTO v_payment_modes
    FROM (
      SELECT payment_mode || ': Rs.' || ROUND(SUM(total_amount))::TEXT AS mode_summary
      FROM bills
      WHERE admin_id = v_admin.admin_profile_id AND is_deleted = false AND created_at::date = v_today AND payment_mode IS NOT NULL
      GROUP BY payment_mode ORDER BY SUM(total_amount) DESC LIMIT 3
    ) sub;

    SELECT i.name || ' (' || SUM(bi.quantity)::TEXT || ' sold)'
    INTO v_top_item
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN items i ON i.id = bi.item_id
    WHERE b.admin_id = v_admin.admin_profile_id AND b.is_deleted = false AND b.created_at::date = v_today
    GROUP BY i.name ORDER BY SUM(bi.quantity) DESC LIMIT 1;

    SELECT COUNT(*) INTO v_low_stock_count
    FROM items
    WHERE admin_id = v_admin.admin_profile_id AND stock_quantity IS NOT NULL AND stock_quantity < 5;

    v_summary := 'Total: Rs.' || ROUND(v_total_sales)::TEXT || ' (' || v_bill_count || ' bills)';
    IF v_payment_modes IS NOT NULL THEN v_summary := v_summary || E'\n' || v_payment_modes; END IF;
    IF v_top_item IS NOT NULL THEN v_summary := v_summary || E'\n' || 'Top: ' || v_top_item; END IF;
    IF v_low_stock_count > 0 THEN v_summary := v_summary || E'\n' || v_low_stock_count || ' items low on stock'; END IF;
    v_summary := v_summary || E'\n' || 'Tap to view full reports';

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (
      v_admin.user_id,
      'Daily Sales Summary - ' || TO_CHAR(v_today, 'DD Mon'),
      v_summary,
      '{"url": "/reports"}'::jsonb
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Daily summary generation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-ensure cron job exists
SELECT cron.unschedule('daily-sales-summary');
SELECT cron.schedule('daily-sales-summary', '0 * * * *', 'SELECT public.generate_daily_summaries();');
