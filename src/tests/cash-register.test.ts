import { describe, it, expect } from 'vitest';
import { computeRegisterTotals } from '@/utils/cashRegister';

describe('cash register totals', () => {
  it('splits bills into cash, UPI and credit', () => {
    const t = computeRegisterTotals([
      { total_amount: 100, payment_mode: 'cash', payment_details: null },
      { total_amount: 200, payment_mode: 'upi', payment_details: {} },
      { total_amount: 150, payment_mode: 'other', payment_details: { cash: 50, khata: 100 } },
    ]);
    expect(t).toMatchObject({ cash: 150, upi: 200, credit: 100, total: 450, count: 3 });
  });
});
