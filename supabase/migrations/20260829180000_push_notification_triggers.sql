-- =============================================================================
-- Push Notification System
-- Queue table + DB triggers → Edge Function processes queue → FCM
-- Permission-based: only users with page access + branch assignment get notified
-- =============================================================================

-- Queue table for pending push notifications
CREATE TABLE IF NOT EXISTS public.push_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on push_queue" ON public.push_queue
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.push_queue TO service_role;
GRANT SELECT ON public.push_queue TO authenticated;

-- Index for fast queue processing
CREATE INDEX IF NOT EXISTS idx_push_queue_unprocessed ON public.push_queue (processed, created_at) WHERE processed = false;


-- =============================================================================
-- Helper: Enqueue push notifications for users with specific page permission
-- in a specific branch (permission + branch scoped)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_by_permission(
  p_admin_id UUID,
  p_branch_id UUID,
  p_required_page TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  INSERT INTO public.push_queue (user_id, title, body, data)

  -- 1. Admin user (owner) - always notified for their own business
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  WHERE p.id = p_admin_id
    AND p.role = 'admin'

  UNION ALL

  -- 2. Sub-users with matching page permission AND branch assignment
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  INNER JOIN user_permissions up ON up.user_id = p.id
    AND up.page_name = p_required_page
    AND up.has_access = true
  WHERE p.admin_id = p_admin_id
    AND p.role = 'user'
    AND (
      -- User is assigned to this specific branch
      EXISTS (
        SELECT 1 FROM user_branches ub
        WHERE ub.user_id = p.user_id
          AND ub.branch_id = p_branch_id
      )
      -- OR user has no branch assignments (access to all branches)
      OR NOT EXISTS (
        SELECT 1 FROM user_branches ub
        WHERE ub.user_id = p.user_id
      )
    );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification enqueue failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- TRIGGER 1: New Online/Remote Order → page: 'onlineOrders'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_new_remote_order()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.notify_by_permission(
    NEW.admin_id,
    NEW.branch_id,
    'onlineOrders',
    '🛒 New Online Order #' || COALESCE(NEW.order_number::TEXT, ''),
    'Order from ' || COALESCE(NEW.customer_name, 'Customer') || ' - ₹' || COALESCE(NEW.total_amount::TEXT, '0'),
    jsonb_build_object('url', '/online-orders', 'order_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_new_remote_order ON public.remote_orders;
CREATE TRIGGER trg_push_new_remote_order
  AFTER INSERT ON public.remote_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_new_remote_order();


-- =============================================================================
-- TRIGGER 2: Table Service Request → page: 'serviceArea'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_service_request()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.notify_by_permission(
    NEW.admin_id,
    NEW.branch_id,
    'serviceArea',
    '🔔 Table ' || COALESCE(NEW.table_number, '?') || ' needs attention',
    COALESCE(NEW.request_type, 'Service') || ' request from Table ' || COALESCE(NEW.table_number, '?'),
    jsonb_build_object('url', '/service-area', 'table', NEW.table_number)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_service_request ON public.table_service_requests;
CREATE TRIGGER trg_push_service_request
  AFTER INSERT ON public.table_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_service_request();


-- =============================================================================
-- TRIGGER 3: New Bill Created → page: 'kitchen'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_new_bill()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_by_permission(
    NEW.admin_id,
    NEW.branch_id,
    'kitchen',
    '🧾 New Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
    'Bill for ₹' || COALESCE(NEW.total_amount::TEXT, '0') || ' - ' || COALESCE(NEW.order_type, 'dine_in'),
    jsonb_build_object('url', '/kitchen', 'bill_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_new_bill ON public.bills;
CREATE TRIGGER trg_push_new_bill
  AFTER INSERT ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_new_bill();


-- =============================================================================
-- TRIGGER 4: Low Stock Alert → page: 'stock'
-- Fires when items.stock_quantity drops below 5
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_threshold NUMERIC := 5;
BEGIN
  -- Only fire when quantity actually decreased and crossed below threshold
  -- Also skip if stock_quantity is NULL (unlimited/untracked)
  IF NEW.stock_quantity IS NOT NULL
     AND NEW.stock_quantity < v_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity >= v_threshold)
  THEN
    PERFORM public.notify_by_permission(
      NEW.admin_id,
      NEW.branch_id,
      'stock',
      '⚠️ Low Stock: ' || COALESCE(NEW.name, 'Item'),
      COALESCE(NEW.name, 'Item') || ' is running low — only ' || NEW.stock_quantity::TEXT || ' left',
      jsonb_build_object('url', '/stock', 'item_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_low_stock ON public.items;
CREATE TRIGGER trg_push_low_stock
  AFTER UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_low_stock();


-- =============================================================================
-- TRIGGER 5: Order Ready (kitchen_status → 'ready') → page: 'serviceArea'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_order_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kitchen_status = 'ready' AND (OLD.kitchen_status IS DISTINCT FROM 'ready') THEN
    PERFORM public.notify_by_permission(
      NEW.admin_id,
      NEW.branch_id,
      'serviceArea',
      '✅ Order Ready — Bill #' || COALESCE(NEW.bill_no::TEXT, ''),
      'Table ' || COALESCE(NEW.table_no, '?') || ' order is ready to serve',
      jsonb_build_object('url', '/service-area', 'bill_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_order_ready ON public.bills;
CREATE TRIGGER trg_push_order_ready
  AFTER UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_order_ready();
