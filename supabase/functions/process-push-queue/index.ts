import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { runBounded, shouldRetryPush } from '../_shared/pushBatch.ts';

/**
 * process-push-queue
 *
 * Called by pg_cron every minute. This function:
 * 1. Uses the SUPABASE_SERVICE_ROLE_KEY to authenticate itself to send-push
 * 2. No external auth is needed because this runs as a cron on Supabase infra
 * 3. The anon key from the incoming request is only used to accept the cron call
 */

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

    // Only our own scheduler / database trigger (internal secret) or the
    // service role may run the queue. Everyone else is rejected.
    const provided = req.headers.get('x-internal-secret') || '';
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let allowed = !!SERVICE_ROLE_KEY && bearer === SERVICE_ROLE_KEY;
    if (!allowed && provided) {
      const { data: expected } = await supabase.rpc('get_internal_secret', { p_name: 'push_queue_cron' });
      allowed = typeof expected === 'string' && expected.length > 0 && expected === provided;
    }
    if (!allowed) return json({ error: 'Unauthorized' }, 401);

    // Leased claims survive worker crashes and exclude overlapping workers.
    const { data: queue, error: fetchError } = await supabase
      .rpc('claim_push_batch', { p_limit: 50 });

    if (fetchError) throw fetchError;
    if (!queue || queue.length === 0) {
      return json({ message: 'No pending notifications', sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    await runBounded(queue, 5, async (item: any) => {
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
            ...(item.token ? { token: item.token } : {}),
          }),
          signal: AbortSignal.timeout(30_000),
        });

        const result = await response.json().catch(() => ({}));
        // Write FCM result back for debugging visibility
        const retry = shouldRetryPush(response.status, result);
        const { error: finishError } = await supabase.rpc('finish_push_attempt', {
          p_id: item.id, p_claim_id: item.claim_id, p_retry: retry, p_result: result,
        });
        if (finishError) throw finishError;

        if (!response.ok || result.success === false) {
          console.error(`[process-push-queue] send-push error for ${item.id}:`, JSON.stringify(result));
          failed++;
        } else {
          sent++;
        }
      } catch (e: any) {
        console.error(`[process-push-queue] Exception for ${item.id}:`, e.message);
        failed++;
        await supabase.rpc('finish_push_attempt', {
          p_id: item.id, p_claim_id: item.claim_id, p_retry: true,
          p_result: { error: e?.message || 'Delivery interrupted' },
        });
      }
    });

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
