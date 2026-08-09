// Shared settlement + event processing logic (used by webhook and reconciliation)
import { admin } from './pg.ts';

export async function nextInvoiceNo(): Promise<string> {
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
  if (txn.status === 'paid') return;

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

export async function processRazorpayEvent(
  evt: Record<string, any>,
  adminId: string | null,
) {
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
      'subscription.resumed': 'active',
      'subscription.paused': 'paused',
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
