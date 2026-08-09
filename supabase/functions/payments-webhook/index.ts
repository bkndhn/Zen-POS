import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  admin,
  getCreds,
  getPlatformCreds,
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqual,
  claimWebhookEvent,
  markWebhookEvent,
} from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function nextInvoiceNo(): Promise<string> {
  const sb = admin();
  const prefix = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  const { count } = await sb
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .like('invoice_no', `${prefix}%`);
  return `${prefix}-${String((count || 0) + 1).padStart(4, '0')}`;
}

/** Mark a transaction paid and settle the record it belongs to. Idempotent. */
export async function settle(txnId: string, patch: Record<string, unknown>) {
  const sb = admin();
  const { data: txn } = await sb
    .from('payment_transactions')
    .select('*')
    .eq('id', txnId)
    .maybeSingle();
  if (!txn) return;
  if (txn.status === 'paid') return; // idempotent

  const paid = patch.status === 'paid';
  await sb
    .from('payment_transactions')
    .update({
      ...patch,
      reconciled_at: new Date().toISOString(),
      ...(paid && !txn.invoice_no ? { invoice_no: await nextInvoiceNo() } : {}),
    })
    .eq('id', txnId);

  if (!paid) return;

  if (txn.purpose === 'order' && txn.reference_id) {
    await sb
      .from('remote_orders')
      .update({ is_paid: true, payment_reference: txnId })
      .eq('id', txn.reference_id);
  }

  if (txn.purpose === 'subscription') {
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
      // Avoid duplicating an auto-created record for the same gateway txn
      const { data: dup } = await sb
        .from('subscription_payments')
        .select('id')
        .eq('gateway_txn_id', txnId)
        .maybeSingle();
      if (!dup) {
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
}

/** Core processing shared by live webhooks and the retry queue. */
export async function processRazorpayEvent(evt: Record<string, any>, adminId: string | null) {
  const sb = admin();
  const event: string = evt.event || '';
  const link = evt.payload?.payment_link?.entity;
  const payment = evt.payload?.payment?.entity;
  const subscription = evt.payload?.subscription?.entity;

  if (event.startsWith('payment_link.')) {
    const txnId = link?.reference_id;
    if (!txnId) return;
    const paid = event === 'payment_link.paid';
    await settle(txnId, {
      status: paid ? 'paid' : event === 'payment_link.expired' ? 'expired' : 'pending',
      provider_payment_id: payment?.id || null,
      method: payment?.method || null,
      utr: payment?.acquirer_data?.upi_transaction_id || payment?.acquirer_data?.rrn || null,
      paid_at: paid ? new Date().toISOString() : null,
      raw_payload: evt,
    });
    return;
  }

  if (event.startsWith('subscription.')) {
    const statusMap: Record<string, string> = {
      'subscription.authenticated': 'active',
      'subscription.activated': 'active',
      'subscription.charged': 'active',
      'subscription.paused': 'paused',
      'subscription.resumed': 'active',
      'subscription.halted': 'halted',
      'subscription.cancelled': 'cancelled',
      'subscription.completed': 'completed',
    };
    const { data: mandate } = await sb
      .from('payment_mandates')
      .select('id, admin_id')
      .eq('provider_subscription_id', subscription?.id || '')
      .maybeSingle();

    await sb
      .from('payment_mandates')
      .update({
        status: statusMap[event] || 'active',
        last_charged_at: event === 'subscription.charged' ? new Date().toISOString() : undefined,
        next_charge_at: subscription?.charge_at
          ? new Date(subscription.charge_at * 1000).toISOString()
          : undefined,
        paused_at: event === 'subscription.paused' ? new Date().toISOString() : null,
        cancelled_at: event === 'subscription.cancelled' ? new Date().toISOString() : null,
        raw_payload: evt,
      })
      .eq('provider_subscription_id', subscription?.id || '');

    if (event === 'subscription.charged' && payment) {
      const owner = mandate?.admin_id || adminId;
      const { data: dup } = await sb
        .from('payment_transactions')
        .select('id')
        .eq('provider_payment_id', payment.id)
        .maybeSingle();
      if (dup) return;
      const txnId = crypto.randomUUID();
      await sb.from('payment_transactions').insert({
        id: txnId,
        admin_id: owner,
        provider: 'razorpay',
        purpose: 'subscription',
        scope: 'platform',
        amount: (payment.amount || 0) / 100,
        status: 'paid',
        provider_payment_id: payment.id,
        method: payment.method,
        paid_at: new Date().toISOString(),
        invoice_no: await nextInvoiceNo(),
        raw_payload: evt,
      });
      await sb.from('subscription_payments').insert({
        admin_id: owner,
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let provider = 'razorpay';
  let eventId = '';
  try {
    const url = new URL(req.url);
    provider = url.searchParams.get('provider') || 'razorpay';
    const scope = url.searchParams.get('scope') === 'platform' ? 'platform' : 'tenant';
    const adminId = url.searchParams.get('admin_id');
    if (scope === 'tenant' && !adminId) return json({ error: 'admin_id required' }, 400);

    const rawBody = await req.text();
    const creds = scope === 'platform'
      ? await getPlatformCreds(provider)
      : await getCreds(adminId!, provider);

    if (provider === 'razorpay') {
      const signature = req.headers.get('x-razorpay-signature') || '';
      if (!creds.webhook_secret) return json({ error: 'Webhook secret not configured' }, 400);
      const expected = await hmacSha256Hex(creds.webhook_secret, rawBody);
      if (!timingSafeEqual(expected, signature)) return json({ error: 'Invalid signature' }, 401);

      const evt = JSON.parse(rawBody);
      eventId =
        req.headers.get('x-razorpay-event-id') ||
        `${evt.event}:${evt.payload?.payment?.entity?.id || evt.payload?.payment_link?.entity?.id || evt.created_at}`;

      const fresh = await claimWebhookEvent({
        provider,
        event_id: eventId,
        event_type: evt.event,
        scope,
        admin_id: adminId,
        payload: evt,
      });
      if (!fresh) return json({ received: true, duplicate: true });

      try {
        await processRazorpayEvent(evt, adminId);
        await markWebhookEvent(provider, eventId, 'processed');
      } catch (err) {
        await markWebhookEvent(provider, eventId, 'failed', (err as Error).message);
        console.error('razorpay processing failed, queued for retry:', err);
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
    eventId = `${merchantTxnId}:${code}`;

    const fresh = await claimWebhookEvent({
      provider,
      event_id: eventId,
      event_type: code,
      scope,
      admin_id: adminId,
      payload: decoded,
    });
    if (!fresh) return json({ received: true, duplicate: true });

    try {
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
      await markWebhookEvent(provider, eventId, 'processed');
    } catch (err) {
      await markWebhookEvent(provider, eventId, 'failed', (err as Error).message);
    }
    return json({ received: true });
  } catch (e) {
    console.error('payments-webhook error:', e);
    if (eventId) await markWebhookEvent(provider, eventId, 'failed', (e as Error).message).catch(() => {});
    return json({ error: (e as Error).message }, 400);
  }
});
