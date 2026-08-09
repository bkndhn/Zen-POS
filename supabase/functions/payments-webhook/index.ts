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
import { settle, processRazorpayEvent } from '../_shared/settle.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
