CREATE OR REPLACE FUNCTION public.notify_by_permission(
  p_admin_id UUID,
  p_branch_id UUID,
  p_required_page TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}',
  p_include_admin BOOLEAN DEFAULT true
) RETURNS void AS $$
BEGIN
  INSERT INTO public.push_queue (user_id, title, body, data)
  -- 1. Admin user (owner) - only if p_include_admin is true
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  WHERE p.id = p_admin_id
    AND p.role = 'admin'
    AND p_include_admin = true

  UNION ALL

  -- 2. Sub-users with matching page permission AND branch assignment
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  INNER JOIN user_permissions up ON up.user_id = p.id
    AND up.page_name = p_required_page
    AND up.has_access = true
  INNER JOIN user_branches ub ON ub.user_id = p.user_id
    AND ub.branch_id = p_branch_id
  WHERE p.admin_id = p_admin_id
    AND EXISTS (
      SELECT 1 FROM shop_settings s 
      WHERE s.user_id = (SELECT user_id FROM profiles WHERE id = p_admin_id LIMIT 1)
      AND s.fcm_unlocked = true AND s.fcm_enabled = true
      LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trigger_push_new_bill()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_uid UUID;
  v_unlocked BOOLEAN;
  v_enabled BOOLEAN;
BEGIN
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  -- 1. Notify kitchen (exclude admin by default from standard KDS alerts)
  PERFORM public.notify_by_permission(
    NEW.admin_id,
    NEW.branch_id,
    'kitchen',
    '🔔 New Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
    'Bill for ₹' || COALESCE(NEW.total_amount::TEXT, '0') || ' - ' || COALESCE(NEW.order_type, 'dine_in'),
    jsonb_build_object('url', '/kitchen', 'bill_id', NEW.id),
    false -- p_include_admin
  );

  -- 2. Check special premium permission for Owner/Client Live Bill Alert
  SELECT user_id INTO v_admin_uid FROM profiles WHERE id = NEW.admin_id LIMIT 1;
  IF v_admin_uid IS NOT NULL THEN
    -- Get settings for the SPECIFIC branch where the bill was created
    SELECT live_bill_push_unlocked, live_bill_push_enabled 
      INTO v_unlocked, v_enabled
    FROM shop_settings 
    WHERE user_id = v_admin_uid
      AND branch_id = NEW.branch_id
    LIMIT 1;

    -- Fallback to any branch if specific branch not found (for legacy single-branch setups)
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
        'Bill #' || COALESCE(NEW.bill_no::TEXT, '') || ' at ' || TO_CHAR(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
        jsonb_build_object('url', '/reports', 'bill_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
