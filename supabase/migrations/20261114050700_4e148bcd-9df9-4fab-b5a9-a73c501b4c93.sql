DROP POLICY IF EXISTS client_webhook_endpoints_tenant_iso ON public.client_webhook_endpoints;
DROP POLICY IF EXISTS "webhook endpoints tenant access" ON public.client_webhook_endpoints;
CREATE POLICY webhook_owner_manage ON public.client_webhook_endpoints FOR ALL TO authenticated USING (NOT public.is_super_admin() AND public.get_my_role()='admin' AND admin_id=public.get_my_profile_id() AND public.has_branch_read_access(admin_id,branch_id)) WITH CHECK (NOT public.is_super_admin() AND public.get_my_role()='admin' AND admin_id=public.get_my_profile_id() AND public.has_branch_read_access(admin_id,branch_id));
DO $$ DECLARE v_def text; v_anchor text; BEGIN
 SELECT pg_get_functiondef('public.create_purchase_transaction(uuid,text,date,text,jsonb)'::regprocedure) INTO v_def;
 v_anchor := 'IF v_admin_id IS NULL THEN RAISE EXCEPTION ''Not authorised''; END IF;';
 IF position(v_anchor IN v_def)=0 THEN RAISE EXCEPTION 'Purchase function changed; aborting patch'; END IF;
 v_def := replace(v_def,v_anchor,v_anchor || E'\n  IF v_user IS NULL OR public.is_super_admin() THEN RAISE EXCEPTION ''Not authorised''; END IF;\n  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.admin_id=v_admin_id) THEN RAISE EXCEPTION ''Supplier not found''; END IF;');
 EXECUTE v_def;
 SELECT pg_get_functiondef('public.create_purchase_return(uuid,uuid,date,text,text,jsonb)'::regprocedure) INTO v_def;
 v_anchor := 'IF v_admin IS NULL THEN RAISE EXCEPTION ''Not authorised''; END IF;';
 IF position(v_anchor IN v_def)=0 THEN RAISE EXCEPTION 'Return function changed; aborting patch'; END IF;
 v_def := replace(v_def,v_anchor,v_anchor || E'\n  IF v_user IS NULL OR public.is_super_admin() THEN RAISE EXCEPTION ''Not authorised''; END IF;\n  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.admin_id=v_admin) THEN RAISE EXCEPTION ''Supplier not found''; END IF;\n  IF p_purchase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=p_purchase_id AND p.admin_id=v_admin) THEN RAISE EXCEPTION ''Purchase not found''; END IF;');
 EXECUTE v_def;
END $$;