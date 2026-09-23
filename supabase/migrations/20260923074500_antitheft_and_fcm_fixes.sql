-- ============================================================
-- Anti-Theft Manager Alert Pushes
-- + Duplicate FCM fix (INSERT-only trigger + dedup)
-- + Daily Summary fix (DISTINCT ON per admin, correct time)
-- ============================================================

-- ── 1. Anti-theft settings columns ───────────────────────────
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS antitheft_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_void_after_kot BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_high_discount BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_discount_threshold_pct NUMERIC DEFAULT 15,
  ADD COLUMN IF NOT EXISTS antitheft_discount_threshold_amt NUMERIC DEFAULT 200,
  ADD COLUMN IF NOT EXISTS antitheft_bill_edit BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_shift_variance BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS antitheft_shift_variance_amt NUMERIC DEFAULT 100;

-- ── 2. Anti-theft audit log table ────────────────────────────
CREATE TABLE IF NOT EXISTS anti_theft_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id),
  branch_id UUID REFERENCES branches(id),
  alert_type TEXT NOT NULL,   -- void_after_kot|high_discount|bill_edit|shift_variance
  severity TEXT DEFAULT 'high',
  bill_id UUID REFERENCES bills(id),
  bill_no TEXT,
  amount NUMERIC,
  cashier_name TEXT,
  cashier_user_id UUID,
  details JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE anti_theft_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_own_alerts ON anti_theft_alerts;
CREATE POLICY admin_own_alerts ON anti_theft_alerts
  FOR ALL USING (
    admin_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
      UNION
      SELECT admin_id FROM profiles WHERE user_id = auth.uid() AND admin_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_anti_theft_admin ON anti_theft_alerts(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anti_theft_unacked ON anti_theft_alerts(admin_id, acknowledged) WHERE acknowledged = false;

-- ── 3. Helper: fire_antitheft_alert ──────────────────────────
-- (already applied live — see previous migration step)

-- ── 4. Bill push trigger: INSERT OR UPDATE with transition guard ─────
-- App inserts bills with total_amount=0, then updates with real amount.
-- Trigger fires on INSERT OR UPDATE. On UPDATE, only continues when
-- total_amount transitions from 0 to > 0 (prevents duplicates).
DROP TRIGGER IF EXISTS trg_push_new_bill ON bills;

CREATE OR REPLACE FUNCTION public.trigger_push_new_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_admin_id UUID;
  v_branch_id UUID;
  v_branch_name TEXT;
  v_auth_uid UUID;
  v_fcm_unlocked BOOLEAN;
  v_branch_fcm_enabled BOOLEAN;
  v_settings RECORD;
  v_total NUMERIC;
  v_bill_no TEXT;
  v_time_str TEXT;
  v_order_type TEXT;
  v_payment_mode TEXT;
  v_body TEXT;
BEGIN
  IF COALESCE(NEW.total_amount, 0) = 0 THEN RETURN NEW; END IF;
  -- On UPDATE: only fire when total_amount transitions from 0/null to > 0
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.total_amount, 0) > 0 THEN RETURN NEW; END IF;
  END IF;
  -- DEDUP: already sent a push for this bill_id in last 60 min?
  IF EXISTS (
    SELECT 1 FROM push_queue
    WHERE (data->>'bill_id') = NEW.id::TEXT
      AND created_at > NOW() - INTERVAL '60 minutes'
  ) THEN RETURN NEW; END IF;

  v_admin_id  := NEW.admin_id;
  v_branch_id := NEW.branch_id;
  v_total     := COALESCE(NEW.total_amount, 0);
  v_bill_no   := COALESCE(NEW.bill_no, NEW.id::TEXT);
  v_time_str  := TO_CHAR(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'hh12:MI AM');
  v_payment_mode := INITCAP(COALESCE(NEW.payment_mode::text, 'cash'));
  v_order_type := CASE COALESCE(NEW.order_type, 'dine_in')
    WHEN 'parcel' THEN 'Parcel' WHEN 'online' THEN 'Online' ELSE 'Dine-in' END;

  SELECT name INTO v_branch_name FROM branches WHERE id = v_branch_id LIMIT 1;
  v_branch_name := COALESCE(v_branch_name, 'Main Branch');
  SELECT user_id INTO v_auth_uid FROM profiles WHERE id = v_admin_id LIMIT 1;
  IF v_auth_uid IS NULL THEN RETURN NEW; END IF;

  SELECT fcm_unlocked INTO v_fcm_unlocked FROM shop_settings WHERE user_id = v_auth_uid LIMIT 1;
  IF NOT COALESCE(v_fcm_unlocked, false) THEN RETURN NEW; END IF;

  SELECT fcm_enabled INTO v_branch_fcm_enabled
  FROM shop_settings WHERE user_id = v_auth_uid AND branch_id = v_branch_id LIMIT 1;
  IF v_branch_fcm_enabled IS NULL THEN
    SELECT fcm_enabled INTO v_branch_fcm_enabled FROM shop_settings
    WHERE user_id = v_auth_uid ORDER BY (fcm_enabled = true) DESC LIMIT 1;
  END IF;

  IF COALESCE(v_branch_fcm_enabled, false) THEN
    PERFORM public.notify_by_permission(
      v_admin_id, v_branch_id, 'kitchen',
      'New Order - ' || v_branch_name,
      '#' || v_bill_no || ' | Rs.' || ROUND(v_total) || ' | ' || v_order_type || ' | ' || v_time_str,
      jsonb_build_object('type', 'new_bill', 'bill_id', NEW.id, 'url', '/kitchen')
    );
  END IF;

  SELECT * INTO v_settings FROM shop_settings WHERE user_id = v_auth_uid AND branch_id = v_branch_id LIMIT 1;
  IF v_settings IS NULL THEN SELECT * INTO v_settings FROM shop_settings WHERE user_id = v_auth_uid LIMIT 1; END IF;

  IF COALESCE(v_settings.live_bill_push_unlocked, false)
     AND COALESCE(v_settings.live_bill_push_enabled, false)
     AND COALESCE(v_branch_fcm_enabled, false)
  THEN
    v_body := v_order_type || ' | ' || v_payment_mode || ' | ' || v_time_str
           || E'\nBill #' || v_bill_no || ' @ ' || v_branch_name;

    INSERT INTO push_queue (user_id, title, body, data)
    SELECT v_auth_uid, 'Rs.' || ROUND(v_total) || ' - ' || v_branch_name, v_body,
      jsonb_build_object('type', 'live_bill', 'bill_id', NEW.id, 'branch_name', v_branch_name, 'url', '/reports')
    WHERE
      EXISTS (SELECT 1 FROM user_devices ud WHERE ud.user_id = v_auth_uid AND ud.enabled = true AND COALESCE(ud.fcm_muted, false) = false)
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = v_auth_uid AND (p.push_preferences->>'live_bill')::text = 'false');

    INSERT INTO push_queue (user_id, title, body, data)
    SELECT DISTINCT p.user_id,
      'Rs.' || ROUND(v_total) || ' - ' || v_branch_name, v_body,
      jsonb_build_object('type', 'live_bill', 'bill_id', NEW.id, 'branch_name', v_branch_name, 'url', '/reports')
    FROM profiles p
    INNER JOIN user_permissions up ON up.user_id = p.user_id AND up.page_name = 'billing' AND up.has_access = true
    INNER JOIN user_branches ub ON ub.user_id = p.user_id AND ub.branch_id = v_branch_id
    WHERE p.admin_id = v_admin_id AND p.role = 'user' AND p.status IS DISTINCT FROM 'inactive'
      AND EXISTS (SELECT 1 FROM user_devices ud WHERE ud.user_id = p.user_id AND ud.enabled = true AND COALESCE(ud.fcm_muted, false) = false)
      AND COALESCE((p.push_preferences->>'live_bill')::text, 'true') != 'false';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_new_bill failed: %', SQLERRM;
  RETURN NEW;
END;
$func$;

-- INSERT OR UPDATE: app inserts with total=0, then updates with real amount
CREATE TRIGGER trg_push_new_bill
  AFTER INSERT OR UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_new_bill();

-- ── 5. Daily Summary fix: DISTINCT ON per admin ───────────────
-- (already applied live — see previous migration step)
