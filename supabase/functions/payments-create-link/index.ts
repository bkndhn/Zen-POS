import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getCreds, getPlatformCreds, rzpFetch, phonepePay } from '../_shared/pg.ts';
import { tenantIdOf, ownedBranchId, resolveSubscriptionPrice, type TenantProfile } from '../_shared/pricing.ts';

const APP_ORIGINS = [/^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i, /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i, /^http:\/\/localhost(:\d+)?$/i, /^capacitor:\/\/localhost$/i, /^https:\/\/localhost$/i];
const DEFAULT_REDIRECT = 'https://zen-pos1.lovable.app';
function safeRedirect(v: unknown): string | undefined {
  try {
    const u = new URL(String(v || ''));
    return APP_ORIGINS.some((re) => re.test(u.origin)) ? u.toString() : undefined;
  } catch { return undefined; }
}

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
    const purpose: 'order' | 'subscription' = body.purpose === 'subscription' ? 'subscription' : 'order';
    const customerPhone = String(body.customer_phone || '').replace(/\D/g, '').slice(0, 15);
    const customerName = String(body.customer_name || 'Customer').slice(0, 80);
    const description = String(body.description || 'Payment').slice(0, 120);

    const sb = admin();

    // The business is always resolved from the signed-in user — never from the request.
    const { data: profile } = await sb
      .from('profiles')
      .select('id, user_id, role, admin_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId = tenantIdOf(profile as TenantProfile);
    const branchId = await ownedBranchId(adminId, body.branch_id);

    // The amount is always derived on the server.
    let amount = 0;
    let referenceId: string | null = null;
    let referenceType: string | null = null;
    if (purpose === 'subscription') {
      const price = await resolveSubscriptionPrice(adminId, Number(body.months) || 1, branchId);
      amount = price.totalAmount;
    } else {
      const refId = String(body.reference_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(refId)) return json({ error: 'reference_id (order) required' }, 400);
      const { data: order } = await sb
        .from('remote_orders')
        .select('id, admin_id, total_amount, is_paid, status')
        .eq('id', refId)
        .eq('admin_id', adminId)
        .maybeSingle();
      if (!order) return json({ error: 'Order not found' }, 404);
      if (order.is_paid) return json({ error: 'Order is already paid' }, 400);
      amount = Number(order.total_amount || 0);
      referenceId = order.id;
      referenceType = 'remote_order';
    }
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Nothing to pay' }, 400);

    // Subscription money is collected by the PLATFORM (super admin) account.
    // Order money is collected by the tenant's own gateway. Fully isolated keys.
    const scope: 'platform' | 'tenant' = purpose === 'subscription' ? 'platform' : 'tenant';
    const creds = scope === 'platform'
      ? await getPlatformCreds(body.provider)
      : await getCreds(adminId, body.provider, branchId);

    const txnId = crypto.randomUUID();
    const callbackUrl = safeRedirect(body.callback_url);

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
        redirectUrl: callbackUrl || DEFAULT_REDIRECT,
        redirectMode: 'REDIRECT',
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook?provider=phonepe&scope=${scope}${scope === 'tenant' ? `&admin_id=${adminId}` : ''}`,
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
      scope,
      environment: creds.mode,
      reference_type: referenceType,
      reference_id: referenceId,
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
    if (purpose === 'order' && referenceId) {
      await sb
        .from('remote_orders')
        .update({ payment_link_url: shortUrl, payment_reference: txnId })
        .eq('id', referenceId)
        .eq('admin_id', adminId);
    }

    return json({ success: true, transaction_id: txnId, short_url: shortUrl, provider: creds.provider });
  } catch (e) {
    console.error('payments-create-link error:', e);
    return json({ error: 'Could not create payment link' }, 400);
  }
});
