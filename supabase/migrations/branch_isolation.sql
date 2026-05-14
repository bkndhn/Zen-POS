-- ============================================================
-- BRANCH ISOLATION MIGRATION
-- ============================================================
-- Run this in your Supabase SQL Editor to add branch_id
-- columns for per-branch data isolation.
-- ============================================================

-- 1. Add branch_id to payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_admin_id ON public.payments(admin_id);

-- 2. Add branch_id to additional_charges table
ALTER TABLE public.additional_charges ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
CREATE INDEX IF NOT EXISTS idx_additional_charges_branch_id ON public.additional_charges(branch_id);

-- 3. Add branch_id + admin_id to expense_categories table
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_branch_id ON public.expense_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_admin_id ON public.expense_categories(admin_id);

-- 4. Add branch_id to tax_rates table (if the table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tax_rates') THEN
        EXECUTE 'ALTER TABLE public.tax_rates ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tax_rates_branch_id ON public.tax_rates(branch_id)';
    END IF;
END $$;

-- ============================================================
-- BILL NUMBER SEQUENCE ISOLATION
-- ============================================================
-- The bill number counter is stored in localStorage on the
-- client side, keyed by: bill_counter_{adminId}_{branchId}
--
-- The initBillCounter() function seeds the counter from the
-- latest bill in the DB filtered by both admin_id AND branch_id.
-- This ensures each branch starts its sequence from its own
-- highest bill number, not sharing a global counter.
--
-- Key format examples:
--   bill_counter_<adminId>_<branchId>   -> per-branch counter
--   bill_date_<adminId>_<branchId>      -> per-branch reset date
--   hotel_pos_continue_bill_number_<branchId> -> per-branch bill style toggle
-- ============================================================

-- ============================================================
-- NOTE: Existing rows will have NULL branch_id.
-- The frontend treats NULL branch_id as "legacy/fallback" data
-- and will show it for any branch until overridden with
-- branch-specific rows.
-- ============================================================
