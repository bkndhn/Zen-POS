ALTER TABLE public.push_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz, ADD COLUMN IF NOT EXISTS claim_id uuid, ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS push_queue_pending_dispatch_idx ON public.push_queue (next_attempt_at, created_at) WHERE processed = false;
CREATE OR REPLACE FUNCTION public.claim_push_batch(p_limit integer DEFAULT 50) RETURNS SETOF public.push_queue LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE public.push_queue q SET claimed_at=now(),claim_id=gen_random_uuid(),attempts=q.attempts+1
 WHERE q.id IN (SELECT id FROM public.push_queue WHERE processed=false AND attempts<5 AND next_attempt_at<=now() AND (claimed_at IS NULL OR claimed_at<now()-interval '5 minutes') ORDER BY created_at LIMIT greatest(1,least(coalesce(p_limit,50),100)) FOR UPDATE SKIP LOCKED) RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_push_attempt(p_id uuid,p_claim_id uuid,p_retry boolean,p_result jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.push_queue SET processed=NOT p_retry OR attempts>=5,claimed_at=NULL,claim_id=NULL,fcm_result=p_result,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) WHERE id=p_id AND claim_id=p_claim_id;
$$;
REVOKE ALL ON FUNCTION public.finish_push_attempt(uuid,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_push_attempt(uuid,uuid,boolean,jsonb) TO service_role;
CREATE TABLE public.counter_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,device_id uuid NOT NULL,device_label text NOT NULL CHECK(length(device_label) BETWEEN 1 AND 80),last_seen_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,device_id));
GRANT SELECT ON public.counter_connections TO authenticated;
GRANT ALL ON public.counter_connections TO service_role;
ALTER TABLE public.counter_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY counter_owner_read ON public.counter_connections FOR SELECT TO authenticated USING (admin_id=public.get_my_admin_id() AND public.get_my_role()='admin');
CREATE INDEX counter_connections_owner_seen_idx ON public.counter_connections(admin_id,last_seen_at DESC);
CREATE OR REPLACE FUNCTION public.report_counter_connection(p_device_id uuid,p_device_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admin uuid;
BEGIN
 IF auth.uid() IS NULL OR p_device_id IS NULL OR length(trim(p_device_label)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid counter registration'; END IF;
 SELECT coalesce(p.admin_id,p.id) INTO v_admin FROM public.profiles p WHERE p.user_id=auth.uid() AND p.status='active' AND p.role::text IN ('admin','user') LIMIT 1;
 IF v_admin IS NULL THEN RAISE EXCEPTION 'Active restaurant account required'; END IF;
 INSERT INTO public.counter_connections(admin_id,user_id,device_id,device_label) VALUES(v_admin,auth.uid(),p_device_id,trim(p_device_label)) ON CONFLICT(user_id,device_id) DO UPDATE SET admin_id=excluded.admin_id,device_label=excluded.device_label,last_seen_at=now(),updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.report_counter_connection(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_counter_connection(uuid,text) TO authenticated;
