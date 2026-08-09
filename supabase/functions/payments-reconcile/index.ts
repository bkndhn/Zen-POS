import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getPlatformCreds, getCreds, rzpFetch } from '../_shared/pg.ts';
import { settle, processRazorpayEvent } from '../_shared/settle.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Reconciliation + webhook retry worker.
 * - Retries webhook events whose processing failed.
 * - Re-queries the provider for transactions stuck in "pending" and corrects them.
 * Callable by a super admin from the app, or by a scheduled job with the service role key.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sb = admin();
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const isCron = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!isCron) {
      if (!token) return json({ error: 'Unauthorized' }, 401);
      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error } = await anon.auth.getClaims(token);
      if (error || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('user_id', claims.claims.sub as string)
        .maybeSingle();
      if (profile?.role !== 'super_admin') return json({ error: 'Forbidden' }, 403);
    }

    const result = { retried: 0, recovered: 0, reconciled: 0, failed: 0 };

    /* 1. Retry failed webhook events (max 6 attempts, backoff handled by next_retry_at) */
    const { data: events } = await sb
      .from('payment_webhook_events')
      .select('*')
      .eq('status', 'failed')
      .lt('attempts', 6)
      .lte('next_retry_at', new Date().toISOString())
      .limit(25);

    for (const ev of events || []) {
      result.retried++;
      try {
        if (ev.provider === 'razorpay') {
          await processRazorpayEvent(ev.payload as Record<string, unknown>, ev.admin_id);
        } else {
          const decoded = ev.payload as Record<string, any>;
          const merchantTxnId = decoded?.data?.merchantTransactionId || '';
          const { data: txn } = await sb
            .from('payment_transactions')
            .select('id')
            .eq('provider_order_id', merchantTxnId)
            .maybeSingle();
          if (txn) {
            const paid = decoded?.code === 'PAYMENT_SUCCESS';
            await settle(txn.id, {
              status: paid ? 'paid' : 'failed',
              provider_payment_id: decoded?.data?.transactionId || null,
              paid_at: paid ? new Date().toISOString() : null,
              raw_payload: decoded,
            });
          }
        }
        await sb
          .from('payment_webhook_events')
          .update({ status: 'processed', processed_at: new Date().toISOString(), attempts: ev.attempts + 1 })
          .eq('id', ev.id);
        result.recovered++;
      } catch (err) {
        result.failed++;
        const attempts = ev.attempts + 1;
        await sb
          .from('payment_webhook_events')
          .update({
            attempts,
            last_error: (err as Error).message,
            next_retry_at: new Date(Date.now() + Math.min(60, 5 * 2 ** attempts) * 60 * 1000).toISOString(),
          })
          .eq('id', ev.id);
      }
    }

    /* 2. Reconcile stuck pending transactions directly with the provider */
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: pending } = await sb
      .from('payment_transactions')
      .select('id, admin_id, scope, provider, provider_link_id, provider_order_id, purpose')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .limit(50);

    for (const txn of pending || []) {
      try {
        if (txn.provider !== 'razorpay' || !txn.provider_link_id) continue;
        const creds =
          txn.scope === 'platform'
            ? await getPlatformCreds('razorpay')
            : await getCreds(txn.admin_id, 'razorpay');
        const link = await rzpFetch(creds, `/payment_links/${txn.provider_link_id}`);
        const status: string = link?.status || 'created';
        if (status === 'paid') {
          const payment = link?.payments?.find?.((p: any) => p.status === 'captured') || null;
          await settle(txn.id, {
            status: 'paid',
            provider_payment_id: payment?.payment_id || null,
            method: payment?.method || null,
            paid_at: new Date().toISOString(),
            raw_payload: link,
          });
          result.reconciled++;
        } else if (status === 'expired' || status === 'cancelled') {
          await sb
            .from('payment_transactions')
            .update({ status: status === 'expired' ? 'expired' : 'failed', reconciled_at: new Date().toISOString() })
            .eq('id', txn.id);
          result.reconciled++;
        }
      } catch (err) {
        console.error('reconcile txn failed', txn.id, (err as Error).message);
      }
    }

    return json({ success: true, ...result });
  } catch (e) {
    console.error('payments-reconcile error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
