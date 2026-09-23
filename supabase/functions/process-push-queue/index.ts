import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * process-push-queue
 *
 * Called by pg_cron every minute. This function:
 * 1. Uses the SUPABASE_SERVICE_ROLE_KEY to authenticate itself to send-push
 * 2. No external auth is needed because this runs as a cron on Supabase infra
 * 3. The anon key from the incoming request is only used to accept the cron call
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    // Use service role to access the push queue
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch unprocessed push notifications (batch of 50), oldest first
    const { data: queue, error: fetchError } = await supabase
      .from('push_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;
    if (!queue || queue.length === 0) {
      return json({ message: 'No pending notifications', sent: 0 });
    }

    let sent = 0;
    let failed = 0;
    const processedIds: string[] = [];

    for (const item of queue) {
      try {
        // Invoke send-push with service role so it can target any user_id
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: item.user_id,
            title: item.title,
            body: item.body,
            data: item.data || {},
          }),
        });

        const result = await response.json().catch(() => ({}));
        // Write FCM result back for debugging visibility
        await supabase.from('push_queue').update({ fcm_result: result }).eq('id', item.id);

        if (!response.ok) {
          console.error(`[process-push-queue] send-push error for ${item.id}:`, JSON.stringify(result));
          failed++;
        } else {
          console.log(`[process-push-queue] sent "${item.title}" → user ${item.user_id} | result: ${JSON.stringify(result)}`);
          sent++;
        }
        processedIds.push(item.id);
      } catch (e: any) {
        console.error(`[process-push-queue] Exception for ${item.id}:`, e.message);
        failed++;
        processedIds.push(item.id); // Still mark as processed to avoid infinite retry
      }
    }

    // Mark all as processed
    if (processedIds.length > 0) {
      await supabase
        .from('push_queue')
        .update({ processed: true })
        .in('id', processedIds);
    }

    // Cleanup: Delete processed entries older than 48 hours
    await supabase
      .from('push_queue')
      .delete()
      .eq('processed', true)
      .lt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

    return json({ sent, failed, total: queue.length });
  } catch (err: any) {
    console.error('[process-push-queue] failed:', err?.message || err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
