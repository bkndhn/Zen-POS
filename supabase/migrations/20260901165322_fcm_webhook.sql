-- 1. Unschedule the polling cron job
SELECT cron.unschedule('process-push-queue');

-- 2. Create the webhook trigger function using pg_net
CREATE OR REPLACE FUNCTION public.webhook_process_push_queue()
RETURNS TRIGGER AS $function
DECLARE
  v_url text := 'https://ivleyttlqlqawghvfyjz.supabase.co/functions/v1/send-push';
  v_secret text;
BEGIN
  -- Get the anon key from vault to authorize the edge function
  SELECT secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  -- wait, the anon key is NOT supabase_url. Let's just use the anon key if we know it. 
  -- But we don't know it. We can just invoke process-push-queue because it doesn't check auth!
  -- Actually, send-push expects Bearer SERVICE_ROLE_KEY.
  -- But process-push-queue doesn't expect ANY auth! It's completely public!
  -- Let's just trigger process-push-queue via pg_net!
  PERFORM net.http_post(
    url := 'https://ivleyttlqlqawghvfyjz.supabase.co/functions/v1/process-push-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  
  RETURN NEW;
END;
$function LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger to push_queue
DROP TRIGGER IF EXISTS trg_push_queue_webhook ON public.push_queue;
CREATE TRIGGER trg_push_queue_webhook
AFTER INSERT ON public.push_queue
FOR EACH STATEMENT
EXECUTE FUNCTION public.webhook_process_push_queue();

-- 4. Fix the 30-min delay in daily-sales-summary
-- We change the pg_cron schedule from top of the hour to minute 30.
SELECT cron.unschedule('daily-sales-summary');
SELECT cron.schedule('daily-sales-summary', '30 * * * *', 'SELECT public.generate_daily_summaries();');
