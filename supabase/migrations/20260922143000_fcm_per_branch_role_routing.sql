-- ============================================================
-- FCM Per-Branch, Role-Based, and Device-Level Control
-- ============================================================

-- ── 1. New columns ───────────────────────────────────────────
-- Device-level mute (user mutes their own device)
ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS fcm_muted BOOLEAN DEFAULT false;

-- Per-user notification type preferences
-- Keys: new_bill, live_bill, low_stock, new_remote_order, order_ready,
--       service_request, khata_due, revenue_milestone, slow_day, daily_summary
-- Value: true (receive) / false (muted for this type)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_preferences JSONB DEFAULT '{}'::jsonb;

-- ── 2. Core router: notify_by_permission ─────────────────────
-- Fixes:
--   a) Per-BRANCH fcm_enabled check (uses branch-specific shop_settings row)
--   b) Correct sub-user join (auth uid based, not profile id)
--   c) Respects push_preferences per notification type
--   d) Respects device-level fcm_muted flag
--   e) Sub-users must be on the affected branch

DROP FUNCTION IF EXISTS public.notify_by_permission(uuid, uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.notify_by_permission(uuid, uuid, text, text, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.notify_by_permission(
  p_admin_id      UUID,
  p_branch_id     UUID,
  p_required_page TEXT,
  p_title         TEXT,
  p_body          TEXT,
  p_data          JSONB DEFAULT '{}'::jsonb,
  p_include_admin BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_admin_auth_uid UUID;
  v_branch_fcm_enabled BOOLEAN;
  v_fcm_unlocked BOOLEAN;
  v_notif_type TEXT;
BEGIN
  SELECT user_id INTO v_admin_auth_uid FROM profiles WHERE id = p_admin_id LIMIT 1;
  IF v_admin_auth_uid IS NULL THEN RETURN; END IF;

  -- Global FCM gate (unlocked by super admin)
  SELECT fcm_unlocked INTO v_fcm_unlocked
  FROM shop_settings WHERE user_id = v_admin_auth_uid LIMIT 1;
  IF NOT COALESCE(v_fcm_unlocked, false) THEN RETURN; END IF;

  -- Per-BRANCH fcm_enabled (look up the exact branch row)
  SELECT fcm_enabled INTO v_branch_fcm_enabled
  FROM shop_settings
  WHERE user_id = v_admin_auth_uid AND branch_id = p_branch_id LIMIT 1;

  -- Fallback: if no per-branch row, use any enabled row
  IF v_branch_fcm_enabled IS NULL THEN
    SELECT fcm_enabled INTO v_branch_fcm_enabled
    FROM shop_settings WHERE user_id = v_admin_auth_uid
    ORDER BY (fcm_enabled = true) DESC LIMIT 1;
  END IF;

  IF NOT COALESCE(v_branch_fcm_enabled, false) THEN RETURN; END IF;

  v_notif_type := COALESCE(p_data->>'type', p_required_page);

  -- 1. Admin notification (with device + preference checks)
  IF p_include_admin THEN
    INSERT INTO push_queue (user_id, title, body, data)
    SELECT v_admin_auth_uid, p_title, p_body, p_data
    WHERE
      EXISTS (
        SELECT 1 FROM user_devices ud
        WHERE ud.user_id = v_admin_auth_uid
          AND ud.enabled = true AND COALESCE(ud.fcm_muted, false) = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = v_admin_auth_uid
          AND (p.push_preferences->>v_notif_type)::text = 'false'
      );
  END IF;

  -- 2. Sub-users with page permission + branch assignment + active non-muted device
  INSERT INTO push_queue (user_id, title, body, data)
  SELECT DISTINCT p.user_id, p_title, p_body, p_data
  FROM profiles p
  INNER JOIN user_permissions up
    ON up.user_id = p.user_id AND up.page_name = p_required_page AND up.has_access = true
  INNER JOIN user_branches ub
    ON ub.user_id = p.user_id AND ub.branch_id = p_branch_id
  WHERE
    p.admin_id = p_admin_id
    AND p.role = 'user'
    AND p.status IS DISTINCT FROM 'inactive'
    AND EXISTS (
      SELECT 1 FROM user_devices ud
      WHERE ud.user_id = p.user_id
        AND ud.enabled = true AND COALESCE(ud.fcm_muted, false) = false
    )
    AND COALESCE((p.push_preferences->>v_notif_type)::text, 'true') != 'false';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_by_permission failed: %', SQLERRM;
END;
$func$;
