import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tenantIdOf, resolveSubscriptionPrice, type TenantProfile } from '../_shared/pricing.ts';
import { admin, getPlatformCreds, rzpFetch } from '../_shared/pg.ts';

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
    const months = Math.min(12, Math.max(1, Math.floor(Number(body.interval_months) || 1)));
    const cycles = Math.min(60, Math.max(1, Math.floor(Number(body.total_count) || 12)));

    const sb = admin();
    const { data: profile } = await sb
      .from('profiles')
      .select('id, user_id, role, admin_id, hotel_name, shop_name, mobile_number')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId: string = tenantIdOf(profile as TenantProfile);

    // Mandates always charge into the PLATFORM account (subscription revenue).
    const creds = await getPlatformCreds('razorpay');
    if (creds.provider !== 'razorpay')
      return json({ error: 'UPI Autopay mandates require Razorpay.' }, 400);
    const cadence: 'monthly' | 'annual' = body.cadence === 'annual' ? 'annual' : 'monthly';
    // Charge amount is always derived on the server from the client's plan pricing.
    const monthlyPrice = (await resolveSubscriptionPrice(adminId, 1, null)).monthlyRate;
    const amount = cadence === 'annual' ? monthlyPrice * 12 : monthlyPrice * months;
    if (!(amount > 0)) return json({ error: 'Subscription price not configured' }, 400);
    const startAt: number | undefined = Number(body.start_at) || undefined;

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
      period: cadence === 'annual' ? 'yearly' : 'monthly',
      interval: cadence === 'annual' ? 1 : months,
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
      ...(startAt ? { start_at: startAt } : {}),
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
        interval_months: cadence === 'annual' ? 12 : months,
        cadence,
        environment: creds.mode,
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
    return json({ error: 'Could not set up auto-pay' }, 400);
  }
});
