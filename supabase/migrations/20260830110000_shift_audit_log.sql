CREATE TABLE IF NOT EXISTS public.shift_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  branch_id UUID,
  shift_id UUID REFERENCES shifts(id),
  action TEXT NOT NULL, -- 'shift_opened', 'shift_closed', 'reconciliation_created', 'shift_adjusted'
  performed_by UUID, -- auth user_id who performed the action
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shift_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own admin audit logs" ON public.shift_audit_log FOR SELECT USING (admin_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE INDEX idx_shift_audit_admin_branch ON public.shift_audit_log (admin_id, branch_id, created_at DESC);

CREATE OR REPLACE FUNCTION trigger_shift_audit_open()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shift_audit_log (admin_id, branch_id, shift_id, action, performed_by, new_values, details)
  VALUES (NEW.admin_id, NEW.branch_id, NEW.id, 'shift_opened', NEW.user_id,
    jsonb_build_object('opening_cash', NEW.opening_cash, 'opened_at', NEW.opened_at),
    'Shift opened with ₹' || COALESCE(NEW.opening_cash::TEXT, '0') || ' opening cash');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_shift_audit_open ON shifts;
CREATE TRIGGER trg_shift_audit_open AFTER INSERT ON shifts FOR EACH ROW EXECUTE FUNCTION trigger_shift_audit_open();

CREATE OR REPLACE FUNCTION trigger_shift_audit_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    INSERT INTO shift_audit_log (admin_id, branch_id, shift_id, action, performed_by, old_values, new_values, details)
    VALUES (NEW.admin_id, NEW.branch_id, NEW.id, 'shift_closed', NEW.user_id,
      jsonb_build_object('opening_cash', OLD.opening_cash, 'status', OLD.status),
      jsonb_build_object('actual_closing_cash', NEW.actual_closing_cash, 'expected_closing_cash', NEW.expected_closing_cash, 'closed_at', NEW.closed_at),
      'Shift closed. Actual: ₹' || COALESCE(NEW.actual_closing_cash::TEXT, '0') || ', Expected: ₹' || COALESCE(NEW.expected_closing_cash::TEXT, '0'));
  ELSE
    INSERT INTO shift_audit_log (admin_id, branch_id, shift_id, action, performed_by, old_values, new_values, details)
    VALUES (NEW.admin_id, NEW.branch_id, NEW.id, 'shift_adjusted', NEW.user_id,
      to_jsonb(OLD), to_jsonb(NEW), 'Shift record modified');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_shift_audit_update ON shifts;
CREATE TRIGGER trg_shift_audit_update AFTER UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION trigger_shift_audit_update();

CREATE OR REPLACE FUNCTION trigger_shift_audit_reconciliation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shift_audit_log (admin_id, branch_id, shift_id, action, performed_by, new_values, details)
  VALUES (NEW.admin_id, NEW.branch_id, NEW.shift_id, 'reconciliation_created', NEW.closed_by,
    jsonb_build_object('total_sales', NEW.total_sales, 'total_bills', NEW.total_bills, 'variance', NEW.variance, 'actual_cash', NEW.actual_cash, 'expected_cash', NEW.expected_cash),
    'Reconciliation recorded. Variance: ₹' || COALESCE(NEW.variance::TEXT, '0'));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_shift_audit_reconciliation ON shift_reconciliations;
CREATE TRIGGER trg_shift_audit_reconciliation AFTER INSERT ON shift_reconciliations FOR EACH ROW EXECUTE FUNCTION trigger_shift_audit_reconciliation();
