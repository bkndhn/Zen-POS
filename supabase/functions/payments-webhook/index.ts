import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { admin, getCreds, hmacSha256Hex, sha256Hex, timingSafeEqual } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Mark a transaction paid and settle the record it belongs to. */
async function settle(txnId: string, patch: Record<string, unknown>) {
  const sb = admin();
  const { data: txn } = await sb
    .from('payment_transactions')
    .select('*')
    .eq('id', txnId)
    .maybeSingle();
  if (!txn) return;
  if (txn.status === 'paid') return; // idempotent

  await sb.from('payment_transactions').update(patch).eq('id', txnId);

  if (patch.status !== 'paid') return;

  if (txn.purpose === 'order' && txn.reference_id) {
    await sb
      .from('remote_orders')
      .update({ is_paid: true, payment_reference: txnId })
      .eq('id', txn.reference_id);
  }

  if (txn.purpose === 'subscription') {
    // Auto-confirm the subscription payment — no manual UTR entry needed
    if (txn.reference_id) {
      await sb
        .from('subscription_payments')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          transaction_ref: (patch.provider_payment_id as string) || txnId,
          gateway_txn_id: txnId,
          gateway_provider: txn.provider,
        })
        .eq('id', txn.reference_id);
    } else {
      await sb.from('subscription_payments').insert({
        admin_id: txn.admin_id,
        amount: Math.round(Number(txn.amount)),
        payment_method: txn.provider,
        transaction_ref: (patch.provider_payment_id as string) || txnId,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        gateway_txn_id: txnId,
        gateway_provider: txn.provider,
        notes: 'Auto-collected via payment gateway',
      });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') || 'razorpay';
    const adminId = url.searchParams.get('admin_id');
    if (!adminId) return json({ error: 'admin_id required' }, 400);

    const rawBody = await req.text();
    const creds = await getCreds(adminId, provider);

    if (provider === 'razorpay') {
      const signature = req.headers.get('x-razorpay-signature') || '';
      if (!creds.webhook_secret) return json({ error: 'Webhook secret not configured' }, 400);
      const expected = await hmacSha256Hex(creds.webhook_secret, rawBody);
      if (!timingSafeEqual(expected, signature)) return json({ error: 'Invalid signature' }, 401);

      const evt = JSON.parse(rawBody);
      const event: string = evt.event || '';
      const link = evt.payload?.payment_link?.entity;
      const payment = evt.payload?.payment?.entity;
      const subscription = evt.payload?.subscription?.entity;

      if (event.startsWith('payment_link.')) {
        const txnId = link?.reference_id;
        if (txnId) {
          const paid = event === 'payment_link.paid';
          await settle(txnId, {
            status: paid ? 'paid' : event === 'payment_link.expired' ? 'expired' : 'pending',
            provider_payment_id: payment?.id || null,
            method: payment?.method || null,
            utr: payment?.acquirer_data?.upi_transaction_id || payment?.acquirer_data?.rrn || null,
            paid_at: paid ? new Date().toISOString() : null,
            raw_payload: evt,
          });
        }
      } else if (event.startsWith('subscription.')) {
        const sb = admin();
        const statusMap: Record<string, string> = {
          'subscription.authenticated': 'active',
          'subscription.activated': 'active',
          'subscription.charged': 'active',
          'subscription.paused': 'paused',
          'subscription.halted': 'halted',
          'subscription.cancelled': 'cancelled',
          'subscription.completed': 'completed',
        };
        await sb
          .from('payment_mandates')
          .update({
            status: statusMap[event] || 'active',
            last_charged_at: event === 'subscription.charged' ? new Date().toISOString() : undefined,
            next_charge_at: subscription?.charge_at
              ? new Date(subscription.charge_at * 1000).toISOString()
              : undefined,
            raw_payload: evt,
          })
          .eq('provider_subscription_id', subscription?.id);

        if (event === 'subscription.charged' && payment) {
          const txnId = crypto.randomUUID();
          await sb.from('payment_transactions').insert({
            id: txnId,
            admin_id: adminId,
            provider: 'razorpay',
            purpose: 'subscription',
            amount: (payment.amount || 0) / 100,
            status: 'paid',
            provider_payment_id: payment.id,
            method: payment.method,
            paid_at: new Date().toISOString(),
            raw_payload: evt,
          });
          await sb.from('subscription_payments').insert({
            admin_id: adminId,
            amount: Math.round((payment.amount || 0) / 100),
            payment_method: 'razorpay_autopay',
            transaction_ref: payment.id,
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            gateway_txn_id: txnId,
            gateway_provider: 'razorpay',
            notes: 'Auto-debited via UPI Autopay mandate',
          });
        }
      }
      return json({ received: true });
    }

    // PhonePe S2S callback
    const signature = (req.headers.get('x-verify') || '').split('###')[0];
    const parsed = JSON.parse(rawBody);
    const base64 = parsed.response;
    if (!creds.salt_key) return json({ error: 'Salt key not configured' }, 400);
    const expected = await sha256Hex(base64 + creds.salt_key);
    if (!timingSafeEqual(expected, signature)) return json({ error: 'Invalid signature' }, 401);

    const decoded = JSON.parse(atob(base64));
    const merchantTxnId: string = decoded?.data?.merchantTransactionId || '';
    const code: string = decoded?.code || '';
    const sb = admin();
    const { data: txn } = await sb
      .from('payment_transactions')
      .select('id')
      .eq('provider_order_id', merchantTxnId)
      .maybeSingle();
    if (txn) {
      const paid = code === 'PAYMENT_SUCCESS';
      await settle(txn.id, {
        status: paid ? 'paid' : 'failed',
        provider_payment_id: decoded?.data?.transactionId || null,
        method: decoded?.data?.paymentInstrument?.type || null,
        utr: decoded?.data?.paymentInstrument?.utr || null,
        error_message: paid ? null : code,
        paid_at: paid ? new Date().toISOString() : null,
        raw_payload: decoded,
      });
    }
    return json({ received: true });
  } catch (e) {
    console.error('payments-webhook error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
