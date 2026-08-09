import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, getCreds, rzpFetch, phonepePay } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Public endpoint used by the QR / WhatsApp ordering flow.
 * A guest can request a payment link for an existing unpaid remote order.
 * The amount always comes from the stored order — never from the client.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || '');
    const deviceId = String(body.device_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'Invalid order id' }, 400);

    const sb = admin();
    const { data: order } = await sb
      .from('remote_orders')
      .select('id, admin_id, branch_id, total_amount, is_paid, customer_name, customer_phone, order_number, device_id, payment_link_url, status')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return json({ error: 'Order not found' }, 404);
    if (deviceId && order.device_id && order.device_id !== deviceId)
      return json({ error: 'Order does not belong to this device' }, 403);
    if (order.is_paid) return json({ error: 'Order is already paid' }, 400);
    if (['cancelled', 'no_show'].includes(order.status || ''))
      return json({ error: 'Order is no longer active' }, 400);

    // Reuse an existing pending link
    if (order.payment_link_url) {
      return json({ success: true, short_url: order.payment_link_url, reused: true });
    }

    const amount = Number(order.total_amount || 0);
    if (!(amount > 0)) return json({ error: 'Order has no payable amount' }, 400);

    const creds = await getCreds(order.admin_id, body.provider, order.branch_id);
    const txnId = crypto.randomUUID();
    const phone = String(order.customer_phone || '').replace(/\D/g, '');

    let shortUrl = '';
    let providerLinkId: string | null = null;
    let providerOrderId: string | null = null;
    let raw: unknown = null;

    if (creds.provider === 'razorpay') {
      const res = await rzpFetch(creds, '/payment_links', 'POST', {
        amount: Math.round(amount * 100),
        currency: 'INR',
        accept_partial: false,
        description: `Order #${order.order_number}`,
        reference_id: txnId,
        customer: {
          name: order.customer_name || 'Customer',
          ...(phone ? { contact: phone.length === 10 ? `+91${phone}` : `+${phone}` } : {}),
        },
        notify: { sms: false, email: false },
        notes: {
          order_id: order.id,
          order_number: String(order.order_number || ''),
          admin_id: order.admin_id,
          branch_id: order.branch_id || '',
          source: 'whatsapp_qr',
        },
      });
      shortUrl = res.short_url;
      providerLinkId = res.id;
      raw = res;
    } else {
      const merchantTxnId = txnId.replace(/-/g, '').slice(0, 34);
      const res = await phonepePay(creds, {
        merchantId: creds.merchant_id,
        merchantTransactionId: merchantTxnId,
        merchantUserId: (phone || 'guest').slice(0, 32),
        amount: Math.round(amount * 100),
        redirectUrl: String(body.redirect_url || 'https://hotel-zen-pos-1.lovable.app'),
        redirectMode: 'REDIRECT',
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook?provider=phonepe&admin_id=${order.admin_id}`,
        mobileNumber: phone || undefined,
        paymentInstrument: { type: 'PAY_PAGE' },
      });
      shortUrl = res.redirectUrl;
      providerOrderId = merchantTxnId;
      raw = res.raw;
    }

    await sb.from('payment_transactions').insert({
      id: txnId,
      admin_id: order.admin_id,
      branch_id: order.branch_id,
      provider: creds.provider,
      purpose: 'order',
      scope: 'tenant',
      environment: creds.mode,
      reference_type: 'remote_order',
      reference_id: order.id,
      customer_name: order.customer_name,
      customer_phone: phone || null,
      amount,
      status: 'pending',
      provider_link_id: providerLinkId,
      provider_order_id: providerOrderId,
      short_url: shortUrl,
      raw_payload: raw as Record<string, unknown>,
    });

    await sb
      .from('remote_orders')
      .update({ payment_link_url: shortUrl, payment_reference: txnId })
      .eq('id', order.id);

    return json({ success: true, short_url: shortUrl, provider: creds.provider, transaction_id: txnId });
  } catch (e) {
    console.error('payments-guest-link error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
