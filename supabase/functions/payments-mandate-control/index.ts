import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getPlatformCreds, rzpFetch } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Pause, resume or cancel the caller's auto-pay mandate. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error } = await anon.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (!['pause', 'resume', 'cancel'].includes(action))
      return json({ error: 'Invalid action' }, 400);

    const sb = admin();
    const { data: profile } = await sb
      .from('profiles')
      .select('user_id, admin_id, role')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId: string = profile.admin_id || profile.user_id;

    const { data: mandate } = await sb
      .from('payment_mandates')
      .select('*')
      .eq('admin_id', adminId)
      .in('status', ['created', 'pending', 'active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!mandate) return json({ error: 'No auto-pay mandate found' }, 404);

    const creds = await getPlatformCreds('razorpay');
    const subId = mandate.provider_subscription_id;
    if (!subId) return json({ error: 'Mandate is not linked to a provider subscription' }, 400);

    let status = mandate.status;
    if (action === 'pause') {
      await rzpFetch(creds, `/subscriptions/${subId}/pause`, 'POST', { pause_at: 'now' });
      status = 'paused';
    } else if (action === 'resume') {
      await rzpFetch(creds, `/subscriptions/${subId}/resume`, 'POST', { resume_at: 'now' });
      status = 'active';
    } else {
      await rzpFetch(creds, `/subscriptions/${subId}/cancel`, 'POST', { cancel_at_cycle_end: 0 });
      status = 'cancelled';
    }

    await sb
      .from('payment_mandates')
      .update({
        status,
        paused_at: action === 'pause' ? new Date().toISOString() : null,
        cancelled_at: action === 'cancel' ? new Date().toISOString() : null,
      })
      .eq('id', mandate.id);

    return json({ success: true, status });
  } catch (e) {
    console.error('payments-mandate-control error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
