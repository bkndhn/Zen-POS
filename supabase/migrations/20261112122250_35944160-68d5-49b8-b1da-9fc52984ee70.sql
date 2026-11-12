CREATE INDEX IF NOT EXISTS idx_bills_branch_date ON public.bills (branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bills_admin_date ON public.bills (admin_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bills_branch_created ON public.bills (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_items_item ON public.bill_items (item_id);
CREATE INDEX IF NOT EXISTS idx_remote_orders_branch_status_created ON public.remote_orders (branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_admin_branch ON public.items (admin_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses (branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_table_orders_branch_unbilled ON public.table_orders (branch_id, created_at DESC) WHERE is_billed = false;