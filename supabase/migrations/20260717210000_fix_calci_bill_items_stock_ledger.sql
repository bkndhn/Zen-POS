-- Update log_bill_item_to_ledger to ignore calci (ad-hoc) items with NULL item_id
CREATE OR REPLACE FUNCTION public.log_bill_item_to_ledger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_branch uuid;
  v_new_stock numeric;
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.admin_id, b.branch_id INTO v_admin, v_branch
    FROM public.bills b WHERE b.id = NEW.bill_id;
  IF v_admin IS NULL THEN RETURN NEW; END IF;

  SELECT stock_quantity INTO v_new_stock FROM public.items WHERE id = NEW.item_id;

  INSERT INTO public.stock_ledger(admin_id, branch_id, item_id, change_qty, balance_after, source_type, source_id, reason, created_by)
    VALUES (v_admin, v_branch, NEW.item_id, -NEW.quantity, v_new_stock, 'sale', NEW.bill_id, 'bill', auth.uid());
  RETURN NEW;
END $$;
