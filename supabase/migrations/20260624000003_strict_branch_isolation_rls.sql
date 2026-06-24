-- =================================================================================
-- STRICT MULTI-TENANCY & BRANCH ISOLATION MIGRATION
-- =================================================================================
-- This migration drops weak RLS policies that only checked `admin_id` and replaces
-- them with a robust SECURITY DEFINER function that strictly validates both 
-- `admin_id` AND `branch_id` against the `user_branches` assignment table.
-- =================================================================================

-- 1. Create the READ security evaluation function
CREATE OR REPLACE FUNCTION public.has_branch_read_access(target_admin_id UUID, target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_my_admin_id uuid;
BEGIN
  SELECT role, CASE WHEN role = 'admin' THEN id ELSE admin_id END INTO v_role, v_my_admin_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF target_admin_id IS NOT NULL AND target_admin_id != v_my_admin_id THEN RETURN FALSE; END IF;
  
  -- Read access allows NULL branches (tenant-wide fallbacks)
  IF target_branch_id IS NULL THEN RETURN TRUE; END IF;
  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  IF v_role = 'user' THEN
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$$;

-- 2. Create the WRITE security evaluation function (stricter)
CREATE OR REPLACE FUNCTION public.has_branch_write_access(target_admin_id UUID, target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_my_admin_id uuid;
BEGIN
  SELECT role, CASE WHEN role = 'admin' THEN id ELSE admin_id END INTO v_role, v_my_admin_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF target_admin_id IS NOT NULL AND target_admin_id != v_my_admin_id THEN RETURN FALSE; END IF;
  
  -- Write access for Admins allows NULL branches
  IF v_role = 'admin' THEN RETURN TRUE; END IF;
  
  -- Write access for Sub-Users STRICTLY forbids NULL branches (they cannot create global data)
  IF v_role = 'user' THEN
    IF target_branch_id IS NULL THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.user_branches WHERE user_id = auth.uid() AND branch_id = target_branch_id) THEN RETURN TRUE; END IF;
  END IF;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_branch_read_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_branch_write_access(UUID, UUID) TO authenticated;

-- Helper macro to generate policies
-- For brevity we apply SELECT using read_access, and INSERT/UPDATE/DELETE using write_access

-- =================================================================================
-- 2. Apply Strict Policies to Core Operational Tables
-- =================================================================================

-- BILLS
DROP POLICY IF EXISTS "Users can view and manage bills" ON public.bills;
DROP POLICY IF EXISTS "Strict isolated access to bills" ON public.bills;
CREATE POLICY "bills_select" ON public.bills FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "bills_modify" ON public.bills FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- EXPENSES
DROP POLICY IF EXISTS "Users can view and manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Strict isolated access to expenses" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "expenses_modify" ON public.expenses FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- ITEMS
DROP POLICY IF EXISTS "Users can view and manage items" ON public.items;
DROP POLICY IF EXISTS "Strict isolated access to items" ON public.items;
CREATE POLICY "items_select" ON public.items FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "items_modify" ON public.items FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- ITEM CATEGORIES
DROP POLICY IF EXISTS "Users can view and manage item categories" ON public.item_categories;
DROP POLICY IF EXISTS "Strict isolated access to item categories" ON public.item_categories;
CREATE POLICY "item_categories_select" ON public.item_categories FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "item_categories_modify" ON public.item_categories FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- EXPENSE CATEGORIES
DROP POLICY IF EXISTS "Users can view and manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Strict isolated access to expense categories" ON public.expense_categories;
CREATE POLICY "expense_categories_select" ON public.expense_categories FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "expense_categories_modify" ON public.expense_categories FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- PAYMENTS
DROP POLICY IF EXISTS "Users can view and manage payments" ON public.payments;
DROP POLICY IF EXISTS "Strict isolated access to payments" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "payments_modify" ON public.payments FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- ADDITIONAL CHARGES
DROP POLICY IF EXISTS "Users can view and manage additional charges" ON public.additional_charges;
DROP POLICY IF EXISTS "Strict isolated access to additional charges" ON public.additional_charges;
CREATE POLICY "additional_charges_select" ON public.additional_charges FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "additional_charges_modify" ON public.additional_charges FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- TAX RATES (If they have branch_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tax_rates' AND column_name = 'branch_id') THEN
        EXECUTE 'DROP POLICY IF EXISTS "View tax rates in own admin scope" ON public.tax_rates';
        EXECUTE 'DROP POLICY IF EXISTS "Admins insert tax rates in own scope" ON public.tax_rates';
        EXECUTE 'DROP POLICY IF EXISTS "Admins update tax rates in own scope" ON public.tax_rates';
        EXECUTE 'DROP POLICY IF EXISTS "Admins delete tax rates in own scope" ON public.tax_rates';
        EXECUTE 'DROP POLICY IF EXISTS "Strict isolated access to tax_rates" ON public.tax_rates';
        EXECUTE 'CREATE POLICY "tax_rates_select" ON public.tax_rates FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id))';
        EXECUTE 'CREATE POLICY "tax_rates_modify" ON public.tax_rates FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id))';
    END IF;
END $$;



-- SHOP SETTINGS
DROP POLICY IF EXISTS "Super admin can update app settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Admins can update app settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Strict isolated update to shop_settings" ON public.shop_settings;
CREATE POLICY "shop_settings_modify" ON public.shop_settings FOR UPDATE TO authenticated USING (public.has_branch_write_access((SELECT id FROM profiles WHERE user_id = shop_settings.user_id), branch_id));

-- TABLES
DROP POLICY IF EXISTS "Strict isolated access to tables" ON public.tables;
CREATE POLICY "tables_select" ON public.tables FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "tables_modify" ON public.tables FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- ONLINE ORDERS
DROP POLICY IF EXISTS "online_orders_select" ON public.online_orders;
DROP POLICY IF EXISTS "online_orders_insert" ON public.online_orders;
DROP POLICY IF EXISTS "online_orders_update" ON public.online_orders;
DROP POLICY IF EXISTS "online_orders_delete" ON public.online_orders;
DROP POLICY IF EXISTS "Strict isolated access to online_orders" ON public.online_orders;
CREATE POLICY "online_orders_read" ON public.online_orders FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "online_orders_modify" ON public.online_orders FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- AGGREGATOR INTEGRATIONS
DROP POLICY IF EXISTS "aggregator_integrations_select" ON public.aggregator_integrations;
DROP POLICY IF EXISTS "aggregator_integrations_insert" ON public.aggregator_integrations;
DROP POLICY IF EXISTS "aggregator_integrations_update" ON public.aggregator_integrations;
DROP POLICY IF EXISTS "aggregator_integrations_delete" ON public.aggregator_integrations;
DROP POLICY IF EXISTS "Strict isolated access to aggregator_integrations" ON public.aggregator_integrations;
CREATE POLICY "aggregator_integrations_read" ON public.aggregator_integrations FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "aggregator_integrations_modify" ON public.aggregator_integrations FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- INVENTORY MODULE
-- stock_ledger
DROP POLICY IF EXISTS "ledger_select" ON public.stock_ledger;
DROP POLICY IF EXISTS "ledger_insert" ON public.stock_ledger;
DROP POLICY IF EXISTS "Strict isolated access to stock_ledger" ON public.stock_ledger;
CREATE POLICY "ledger_read" ON public.stock_ledger FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, branch_id));
CREATE POLICY "ledger_write" ON public.stock_ledger FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, branch_id));

-- stock_transfers
DROP POLICY IF EXISTS "transfers_select" ON public.stock_transfers;
DROP POLICY IF EXISTS "transfers_modify" ON public.stock_transfers;
DROP POLICY IF EXISTS "Strict isolated access to stock_transfers" ON public.stock_transfers;
CREATE POLICY "transfers_read" ON public.stock_transfers FOR SELECT TO authenticated USING (public.has_branch_read_access(admin_id, from_branch_id) OR public.has_branch_read_access(admin_id, to_branch_id));
CREATE POLICY "transfers_write" ON public.stock_transfers FOR ALL TO authenticated USING (public.has_branch_write_access(admin_id, from_branch_id) OR public.has_branch_write_access(admin_id, to_branch_id));


