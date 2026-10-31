import { describe, it, expect } from 'vitest';
import { resolveRemotePaymentOptions } from '@/utils/remotePaymentMethods';

describe('online menu payment choices', () => {
  it('both: customer sees UPI and pay on delivery', () => {
    const o = resolveRemotePaymentOptions({ remote_payment_methods: 'both', upi_id: 'shop@upi' });
    expect(o.allowOnline).toBe(true);
    expect(o.allowCod).toBe(true);
  });

  it('online only: pay on delivery is hidden', () => {
    const o = resolveRemotePaymentOptions({ remote_payment_methods: 'online_only', upi_id: 'shop@upi' });
    expect(o.allowOnline).toBe(true);
    expect(o.allowCod).toBe(false);
  });

  it('pay on delivery only: UPI is hidden even when a UPI ID is saved', () => {
    const o = resolveRemotePaymentOptions({ remote_payment_methods: 'cod_only', upi_id: 'shop@upi' });
    expect(o.allowOnline).toBe(false);
    expect(o.allowCod).toBe(true);
  });

  it('online only without a UPI ID blocks ordering instead of letting it through unpaid', () => {
    const o = resolveRemotePaymentOptions({ remote_payment_methods: 'online_only', upi_id: '  ' });
    expect(o.blocked).toBe(true);
    expect(o.allowCod).toBe(false);
  });

  it('old "require payment before order" setting still means online only', () => {
    const o = resolveRemotePaymentOptions({ require_payment_before_order: true, upi_id: 'shop@upi' });
    expect(o.mode).toBe('online_only');
    expect(o.allowCod).toBe(false);
  });
});
