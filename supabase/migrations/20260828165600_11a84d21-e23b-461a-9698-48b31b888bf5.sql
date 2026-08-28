CREATE TABLE public.shift_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  closed_by uuid,
  opened_at timestamptz,
  closed_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric NOT NULL DEFAULT 0,
  cash_sales numeric NOT NULL DEFAULT 0,
  adjustments numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  actual_cash numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  total_sales numeric NOT NULL DEFAULT 0,
  total_bills integer NOT NULL DEFAULT 0,
  payment_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shift_recon_admin_branch ON public.shift_reconciliations (admin_id, branch_id, closed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_reconciliations TO authenticated;
GRANT ALL ON public.shift_reconciliations TO service_role;

ALTER TABLE public.shift_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_recon_select_own_tenant" ON public.shift_reconciliations
  FOR SELECT TO authenticated
  USING (admin_id = public.get_my_admin_id());

CREATE POLICY "shift_recon_insert_own_tenant" ON public.shift_reconciliations
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = public.get_my_admin_id());

CREATE POLICY "shift_recon_update_admin_only" ON public.shift_reconciliations
  FOR UPDATE TO authenticated
  USING (admin_id = public.get_my_admin_id() AND public.is_admin_or_super())
  WITH CHECK (admin_id = public.get_my_admin_id());

CREATE POLICY "shift_recon_delete_admin_only" ON public.shift_reconciliations
  FOR DELETE TO authenticated
  USING (admin_id = public.get_my_admin_id() AND public.is_admin_or_super());