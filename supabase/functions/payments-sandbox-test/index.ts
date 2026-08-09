import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, getPlatformCreds, getCreds, hmacSha256Hex } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Sandbox tester (super admin only).
 * Fires a signed fake Razorpay webhook at our own endpoint so an admin can verify
 * credentials, signature validation, idempotency and settlement before going live.
 */
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

    const sb = admin();
    const { data: profile } = await sb
      .from('profiles')
      .select('id, user_id, role, admin_id')
      .eq('user_id', claims.claims.sub as string)
      .maybeSingle();

    const body = await req.json().catch(() => ({}));
    const scope = body.scope === 'tenant' ? 'tenant' : 'platform';
    const outcome: 'success' | 'failure' | 'duplicate' =
      ['success', 'failure', 'duplicate'].includes(body.outcome) ? body.outcome : 'success';

    if (scope === 'platform' && profile?.role !== 'super_admin')
      return json({ error: 'Forbidden' }, 403);

    const adminId: string | null =
      scope === 'tenant' ? (profile?.admin_id || profile?.user_id || null) : null;

    const creds = scope === 'platform'
      ? await getPlatformCreds('razorpay')
      : await getCreds(adminId!, 'razorpay');

    const checks: { step: string; ok: boolean; detail?: string }[] = [];
    checks.push({ step: 'Credentials saved', ok: !!(creds.key_id && creds.key_secret) });
    checks.push({ step: 'Webhook secret configured', ok: !!creds.webhook_secret });
    checks.push({ step: 'Environment', ok: true, detail: creds.mode });
    if (!creds.webhook_secret) return json({ success: false, checks });

    // Create a throwaway test transaction so settlement has something to act on
    const txnId = crypto.randomUUID();
    await sb.from('payment_transactions').insert({
      id: txnId,
      admin_id: adminId,
      provider: 'razorpay',
      purpose: 'subscription',
      scope,
      environment: 'test',
      amount: 1,
      status: 'pending',
      customer_name: 'Sandbox Test',
      short_url: 'https://sandbox.local/test',
    });

    const evt = {
      entity: 'event',
      event: outcome === 'failure' ? 'payment_link.expired' : 'payment_link.paid',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment_link: { entity: { id: `plink_test_${txnId.slice(0, 8)}`, reference_id: txnId } },
        payment: {
          entity: {
            id: `pay_test_${txnId.slice(0, 8)}`,
            method: 'upi',
            acquirer_data: { upi_transaction_id: 'TESTUTR0001' },
          },
        },
      },
    };
    const raw = JSON.stringify(evt);
    const signature = await hmacSha256Hex(creds.webhook_secret, raw);
    const eventId = `sandbox_${txnId}`;
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payments-webhook?provider=razorpay&scope=${scope}${adminId ? `&admin_id=${adminId}` : ''}`;

    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
          'x-razorpay-event-id': eventId,
        },
        body: raw,
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

    const first = await send();
    checks.push({
      step: 'Webhook reachable & signature verified',
      ok: first.status === 200,
      detail: JSON.stringify(first.body),
    });

    let dupOk: boolean | undefined;
    if (outcome === 'duplicate') {
      const second = await send();
      dupOk = second.status === 200 && (second.body as any)?.duplicate === true;
      checks.push({ step: 'Duplicate delivery ignored (idempotent)', ok: !!dupOk });
    }

    const { data: settled } = await sb
      .from('payment_transactions')
      .select('status, invoice_no')
      .eq('id', txnId)
      .maybeSingle();

    checks.push({
      step: 'Test payment settled',
      ok: outcome === 'failure' ? settled?.status === 'expired' : settled?.status === 'paid',
      detail: `status=${settled?.status}${settled?.invoice_no ? `, invoice=${settled.invoice_no}` : ''}`,
    });

    return json({ success: checks.every((c) => c.ok), checks, transaction_id: txnId });
  } catch (e) {
    console.error('payments-sandbox-test error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
