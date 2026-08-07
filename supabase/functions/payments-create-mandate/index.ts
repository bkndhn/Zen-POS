import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getCreds, rzpFetch } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error } = await anon.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const months = Math.max(1, Number(body.interval_months) || 1);
    const cycles = Math.max(1, Number(body.total_count) || 12);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Invalid amount' }, 400);

    const sb = admin();
    const { data: profile } = await sb
      .from('profiles')
      .select('user_id, admin_id, hotel_name, shop_name, mobile_number')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId: string = profile.admin_id || profile.user_id;

    const creds = await getCreds(adminId, 'razorpay');
    if (creds.provider !== 'razorpay')
      return json({ error: 'UPI Autopay mandates require Razorpay.' }, 400);

    // Reuse an active mandate if one already exists
    const { data: existing } = await sb
      .from('payment_mandates')
      .select('*')
      .eq('admin_id', adminId)
      .in('status', ['created', 'pending', 'active'])
      .maybeSingle();
    if (existing?.short_url && existing.status !== 'active') {
      return json({ success: true, short_url: existing.short_url, mandate_id: existing.id, reused: true });
    }
    if (existing?.status === 'active') {
      return json({ success: true, already_active: true, mandate_id: existing.id });
    }

    const plan = await rzpFetch(creds, '/plans', 'POST', {
      period: 'monthly',
      interval: months,
      item: {
        name: `${profile.shop_name || profile.hotel_name || 'ZenPOS'} Subscription`,
        amount: Math.round(amount * 100),
        currency: 'INR',
      },
    });

    const subscription = await rzpFetch(creds, '/subscriptions', 'POST', {
      plan_id: plan.id,
      total_count: cycles,
      customer_notify: 1,
      notes: { admin_id: adminId },
    });

    const { data: inserted, error: insErr } = await sb
      .from('payment_mandates')
      .insert({
        admin_id: adminId,
        provider: 'razorpay',
        provider_plan_id: plan.id,
        provider_subscription_id: subscription.id,
        amount,
        interval_months: months,
        status: 'pending',
        short_url: subscription.short_url,
        next_charge_at: subscription.charge_at
          ? new Date(subscription.charge_at * 1000).toISOString()
          : null,
        raw_payload: subscription,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    return json({ success: true, short_url: subscription.short_url, mandate_id: inserted.id });
  } catch (e) {
    console.error('payments-create-mandate error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
