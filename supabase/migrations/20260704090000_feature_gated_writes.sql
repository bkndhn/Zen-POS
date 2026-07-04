-- =========================================================================
-- Trigger Function: enforce_client_feature_permissions
-- Purpose: Prevent inserting data into tables if the client lacks the permission
-- =========================================================================
CREATE OR REPLACE FUNCTION public.enforce_client_feature_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perms jsonb;
BEGIN
  -- Get client permissions for the admin
  SELECT client_permissions INTO v_perms
  FROM public.profiles
  WHERE id = NEW.admin_id;

  IF v_perms IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Dine-In / KDS Tables
  IF TG_TABLE_NAME IN ('table_orders', 'table_service_requests') THEN
    IF COALESCE((v_perms->>'/kitchen')::boolean, true) = false 
       AND COALESCE((v_perms->>'/serviceArea')::boolean, true) = false 
       AND COALESCE((v_perms->>'/qrMenu')::boolean, true) = false 
       AND COALESCE((v_perms->>'/tables')::boolean, true) = false 
       AND COALESCE((v_perms->>'/tableBilling')::boolean, true) = false THEN
      RAISE EXCEPTION 'Permission Denied: Dine-in and Kitchen features are disabled for this tenant.';
    END IF;
  END IF;

  -- 2. Expenses Tables
  IF TG_TABLE_NAME IN ('expenses') THEN
    IF COALESCE((v_perms->>'/expenses')::boolean, true) = false THEN
      RAISE EXCEPTION 'Permission Denied: Expenses module is disabled for this tenant.';
    END IF;
  END IF;

  -- 3. Stock / Inventory / Purchases / Suppliers Tables
  IF TG_TABLE_NAME IN ('purchases', 'suppliers', 'stock_ledger', 'stock_transfers', 'purchase_returns', 'stock_adjustments') THEN
    IF COALESCE((v_perms->>'/stock')::boolean, true) = false 
       AND COALESCE((v_perms->>'/purchases')::boolean, true) = false 
       AND COALESCE((v_perms->>'/suppliers')::boolean, true) = false THEN
      RAISE EXCEPTION 'Permission Denied: Inventory and Stock modules are disabled for this tenant.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =========================================================================
-- Trigger Function: prune_deactivated_feature_data
-- Purpose: Proactively delete data when a feature is deactivated to save storage
-- =========================================================================
CREATE OR REPLACE FUNCTION public.prune_deactivated_feature_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- We only care if client_permissions is changed
  IF OLD.client_permissions IS DISTINCT FROM NEW.client_permissions THEN
    
    -- 1. KDS / Dine-In deactivated
    IF (COALESCE((NEW.client_permissions->>'/kitchen')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/serviceArea')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/qrMenu')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/tables')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/tableBilling')::boolean, true) = false)
       AND NOT 
       (COALESCE((OLD.client_permissions->>'/kitchen')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/serviceArea')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/qrMenu')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/tables')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/tableBilling')::boolean, true) = false) THEN
      
      DELETE FROM public.table_orders WHERE admin_id = NEW.id;
      DELETE FROM public.table_service_requests WHERE admin_id = NEW.id;
    END IF;

    -- 2. Expenses deactivated
    IF COALESCE((NEW.client_permissions->>'/expenses')::boolean, true) = false 
       AND COALESCE((OLD.client_permissions->>'/expenses')::boolean, true) = true THEN
      
      DELETE FROM public.expenses WHERE admin_id = NEW.id;
    END IF;

    -- 3. Stock / Inventory deactivated
    IF (COALESCE((NEW.client_permissions->>'/stock')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/purchases')::boolean, true) = false 
        AND COALESCE((NEW.client_permissions->>'/suppliers')::boolean, true) = false)
       AND NOT 
       (COALESCE((OLD.client_permissions->>'/stock')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/purchases')::boolean, true) = false 
        AND COALESCE((OLD.client_permissions->>'/suppliers')::boolean, true) = false) THEN
      
      DELETE FROM public.purchases WHERE admin_id = NEW.id;
      DELETE FROM public.purchase_payments WHERE admin_id = NEW.id;
      DELETE FROM public.suppliers WHERE admin_id = NEW.id;
      DELETE FROM public.stock_ledger WHERE admin_id = NEW.id;
      DELETE FROM public.stock_transfers WHERE admin_id = NEW.id;
      DELETE FROM public.purchase_returns WHERE admin_id = NEW.id;
      DELETE FROM public.stock_adjustments WHERE admin_id = NEW.id;
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

-- =========================================================================
-- Attach Triggers
-- =========================================================================

-- table_orders
DROP TRIGGER IF EXISTS trg_enforce_table_orders_perms ON public.table_orders;
CREATE TRIGGER trg_enforce_table_orders_perms
BEFORE INSERT ON public.table_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_feature_permissions();

-- table_service_requests
DROP TRIGGER IF EXISTS trg_enforce_service_reqs_perms ON public.table_service_requests;
CREATE TRIGGER trg_enforce_service_reqs_perms
BEFORE INSERT ON public.table_service_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_feature_permissions();

-- expenses
DROP TRIGGER IF EXISTS trg_enforce_expenses_perms ON public.expenses;
CREATE TRIGGER trg_enforce_expenses_perms
BEFORE INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_feature_permissions();

-- purchases
DROP TRIGGER IF EXISTS trg_enforce_purchases_perms ON public.purchases;
CREATE TRIGGER trg_enforce_purchases_perms
BEFORE INSERT ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_feature_permissions();

-- suppliers
DROP TRIGGER IF EXISTS trg_enforce_suppliers_perms ON public.suppliers;
CREATE TRIGGER trg_enforce_suppliers_perms
BEFORE INSERT ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_feature_permissions();

-- profiles (prune data trigger)
DROP TRIGGER IF EXISTS trg_prune_deactivated_feature_data ON public.profiles;
CREATE TRIGGER trg_prune_deactivated_feature_data
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prune_deactivated_feature_data();
