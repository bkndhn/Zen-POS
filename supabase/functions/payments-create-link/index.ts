import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getCreds, rzpFetch, phonepePay } from '../_shared/pg.ts';

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
    const { data: claims, error: claimErr } = await anon.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Invalid amount' }, 400);
    const purpose: 'order' | 'subscription' = body.purpose === 'subscription' ? 'subscription' : 'order';
    const customerPhone = String(body.customer_phone || '').replace(/\D/g, '');
    const customerName = String(body.customer_name || 'Customer').slice(0, 80);
    const description = String(body.description || 'Payment').slice(0, 120);

    const sb = admin();

    // Resolve which business this payment belongs to
    const { data: profile } = await sb
      .from('profiles')
      .select('id, user_id, role, admin_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId: string = body.admin_id || profile.admin_id || profile.user_id;
    const branchId: string | null = body.branch_id || null;

    const creds = await getCreds(adminId, body.provider, branchId);

    const txnId = crypto.randomUUID();
    const callbackUrl = String(body.callback_url || '') || undefined;

    let shortUrl = '';
    let providerLinkId: string | null = null;
    let providerOrderId: string | null = null;
    let raw: unknown = null;

    if (creds.provider === 'razorpay') {
      const res = await rzpFetch(creds, '/payment_links', 'POST', {
        amount: Math.round(amount * 100),
        currency: 'INR',
        accept_partial: false,
        description,
        reference_id: txnId,
        customer: {
          name: customerName,
          ...(customerPhone ? { contact: customerPhone.length === 10 ? `+91${customerPhone}` : `+${customerPhone}` } : {}),
        },
        notify: { sms: false, email: false },
        reminder_enable: true,
        ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
      });
      shortUrl = res.short_url;
      providerLinkId = res.id;
      raw = res;
    } else {
      const res = await phonepePay(creds, {
        merchantId: creds.merchant_id,
        merchantTransactionId: txnId.replace(/-/g, '').slice(0, 34),
        merchantUserId: (customerPhone || 'guest').slice(0, 32),
        amount: Math.round(amount * 100),
        redirectUrl: callbackUrl || 'https://hotel-zen-pos-1.lovable.app',
        redirectMode: 'REDIRECT',
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook?provider=phonepe&admin_id=${adminId}`,
        mobileNumber: customerPhone || undefined,
        paymentInstrument: { type: 'PAY_PAGE' },
      });
      shortUrl = res.redirectUrl;
      providerOrderId = txnId.replace(/-/g, '').slice(0, 34);
      raw = res.raw;
    }

    const { error: insErr } = await sb.from('payment_transactions').insert({
      id: txnId,
      admin_id: adminId,
      branch_id: branchId,
      provider: creds.provider,
      purpose,
      reference_type: body.reference_type || null,
      reference_id: body.reference_id || null,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      amount,
      status: 'pending',
      provider_link_id: providerLinkId,
      provider_order_id: providerOrderId,
      short_url: shortUrl,
      raw_payload: raw as Record<string, unknown>,
    });
    if (insErr) throw new Error(insErr.message);

    // Attach the link to the source record so the app can show it
    if (purpose === 'order' && body.reference_id) {
      await sb
        .from('remote_orders')
        .update({ payment_link_url: shortUrl, payment_reference: txnId })
        .eq('id', body.reference_id);
    }

    return json({ success: true, transaction_id: txnId, short_url: shortUrl, provider: creds.provider });
  } catch (e) {
    console.error('payments-create-link error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
