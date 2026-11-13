GRANT INSERT (admin_id,user_id,device_id,device_label), UPDATE (device_label,last_seen_at,updated_at) ON public.counter_connections TO authenticated;
CREATE POLICY counter_self_insert ON public.counter_connections FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND admin_id=public.get_my_admin_id() AND public.get_my_role() IN ('admin','user') AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND status='active'));
CREATE POLICY counter_self_update ON public.counter_connections FOR UPDATE TO authenticated USING (user_id=auth.uid() AND admin_id=public.get_my_admin_id() AND public.get_my_role() IN ('admin','user')) WITH CHECK(user_id=auth.uid() AND admin_id=public.get_my_admin_id());
CREATE POLICY counter_self_read ON public.counter_connections FOR SELECT TO authenticated USING(user_id=auth.uid() AND admin_id=public.get_my_admin_id() AND public.get_my_role() IN ('admin','user'));
CREATE OR REPLACE FUNCTION public.report_counter_connection(p_device_id uuid,p_device_label text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR p_device_id IS NULL OR length(trim(p_device_label)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid counter registration'; END IF;
 INSERT INTO public.counter_connections(admin_id,user_id,device_id,device_label) VALUES(public.get_my_admin_id(),auth.uid(),p_device_id,trim(p_device_label)) ON CONFLICT(user_id,device_id) DO UPDATE SET device_label=excluded.device_label,last_seen_at=now(),updated_at=now();
END; $$;
CREATE OR REPLACE FUNCTION public.stamp_counter_connection() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN NEW.last_seen_at=now(); NEW.updated_at=now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.stamp_counter_connection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER stamp_counter_connection BEFORE INSERT OR UPDATE ON public.counter_connections FOR EACH ROW EXECUTE FUNCTION public.stamp_counter_connection();