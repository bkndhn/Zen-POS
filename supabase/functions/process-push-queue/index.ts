import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * process-push-queue
 * 
 * Called by pg_cron every 30 seconds OR by a database webhook on push_queue INSERT.
 * Reads unprocessed rows from push_queue, calls send-push for each, marks them as processed.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? "";
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unprocessed push notifications (batch of 50)
    const { data: queue, error: fetchError } = await supabase
      .from('push_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending notifications' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let sent = 0;
    let failed = 0;
    const processedIds: string[] = [];

    for (const item of queue) {
      try {
        // Call the existing send-push function
        const { error: invokeError } = await supabase.functions.invoke('send-push', {
          body: {
            user_id: item.user_id,
            title: item.title,
            body: item.body,
            data: item.data || {},
          },
        });

        if (invokeError) {
          console.error(`Failed to send push for ${item.id}:`, invokeError);
          failed++;
        } else {
          sent++;
        }
        processedIds.push(item.id);
      } catch (e: any) {
        console.error(`Exception sending push for ${item.id}:`, e.message);
        failed++;
        processedIds.push(item.id); // Still mark as processed to prevent infinite retry
      }
    }

    // Mark all as processed
    if (processedIds.length > 0) {
      await supabase
        .from('push_queue')
        .update({ processed: true })
        .in('id', processedIds);
    }

    // Cleanup: Delete processed entries older than 24 hours
    await supabase
      .from('push_queue')
      .delete()
      .eq('processed', true)
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    return new Response(JSON.stringify({ sent, failed, total: queue.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error("Process push queue failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
