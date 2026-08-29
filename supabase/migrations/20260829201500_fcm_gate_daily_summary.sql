-- FCM Gate & Daily Summary System
-- Super admin controls FCM access per client

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS fcm_unlocked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fcm_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_summary_time TEXT DEFAULT NULL;

-- Update notify_by_permission to check FCM gate
CREATE OR REPLACE FUNCTION public.notify_by_permission(
  p_admin_id UUID,
  p_branch_id UUID,
  p_required_page TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  v_fcm_active BOOLEAN;
BEGIN
  SELECT (COALESCE(fcm_unlocked, false) AND COALESCE(fcm_enabled, false))
  INTO v_fcm_active
  FROM shop_settings
  WHERE admin_id = p_admin_id
  LIMIT 1;

  IF NOT COALESCE(v_fcm_active, false) THEN
    RETURN;
  END IF;

  INSERT INTO public.push_queue (user_id, title, body, data)
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  WHERE p.id = p_admin_id AND p.role = 'admin'
  UNION ALL
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  INNER JOIN user_permissions up ON up.user_id = p.id
    AND up.page_name = p_required_page
    AND up.has_access = true
  WHERE p.admin_id = p_admin_id
    AND p.role = 'user'
    AND (
      EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = p.user_id AND ub.branch_id = p_branch_id)
      OR NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = p.user_id)
    );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification enqueue failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Daily summary generator
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
    SELECT ss.admin_id, p.user_id, ss.daily_summary_time
    FROM shop_settings ss
    JOIN profiles p ON p.id = ss.admin_id
    WHERE ss.fcm_unlocked = true
      AND ss.fcm_enabled = true
      AND ss.daily_summary_time IS NOT NULL
      AND ss.daily_summary_time = TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
  LOOP
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_bill_count
    FROM bills
    WHERE admin_id = v_admin.admin_id
      AND is_deleted = false
      AND created_at::date = v_today;

    SELECT string_agg(mode_summary, ' | ')
    INTO v_payment_modes
    FROM (
      SELECT payment_mode || ': ₹' || ROUND(SUM(total_amount))::TEXT AS mode_summary
      FROM bills
      WHERE admin_id = v_admin.admin_id AND is_deleted = false AND created_at::date = v_today AND payment_mode IS NOT NULL
      GROUP BY payment_mode ORDER BY SUM(total_amount) DESC LIMIT 3
    ) sub;

    SELECT i.name || ' (' || SUM(bi.quantity)::TEXT || ' sold)'
    INTO v_top_item
    FROM bill_items bi JOIN bills b ON b.id = bi.bill_id JOIN items i ON i.id = bi.item_id
    WHERE b.admin_id = v_admin.admin_id AND b.is_deleted = false AND b.created_at::date = v_today
    GROUP BY i.name ORDER BY SUM(bi.quantity) DESC LIMIT 1;

    SELECT COUNT(*) INTO v_low_stock_count
    FROM items WHERE admin_id = v_admin.admin_id AND stock_quantity IS NOT NULL AND stock_quantity < 5;

    v_summary := '💰 Total: ₹' || ROUND(v_total_sales)::TEXT || ' (' || v_bill_count || ' bills)';
    IF v_payment_modes IS NOT NULL THEN v_summary := v_summary || E'\n' || v_payment_modes; END IF;
    IF v_top_item IS NOT NULL THEN v_summary := v_summary || E'\n' || '📈 Top: ' || v_top_item; END IF;
    IF v_low_stock_count > 0 THEN v_summary := v_summary || E'\n' || '⚠️ ' || v_low_stock_count || ' items low on stock'; END IF;
    v_summary := v_summary || E'\n' || 'Tap to view full reports →';

    INSERT INTO push_queue (user_id, title, body, data)
    VALUES (v_admin.user_id, '📊 Daily Sales Summary — ' || TO_CHAR(v_today, 'DD Mon'), v_summary, '{"url": "/reports"}'::jsonb);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Daily summary generation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron: run every hour to check which admins need their daily summary
SELECT cron.schedule('daily-sales-summary', '0 * * * *', 'SELECT public.generate_daily_summaries();');
