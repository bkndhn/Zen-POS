import { describe, it, expect } from 'vitest';
import { denominationTotal, expectedDrawerCash, cashVariance, varianceNeedsReason, varianceLabel, netProfit } from '@/utils/shiftReconciliation';

describe('shift reconciliation', () => {
  it('counts notes and coins', () => {
    expect(denominationTotal({ n500: 4, n200: 1, n100: 3, n10: 2, coins: 7 })).toBe(2527);
  });
  it('ignores negative counts', () => {
    expect(denominationTotal({ n500: -2, n100: 1 })).toBe(100);
  });
  it('expected = float + cash sales + paid-in − cash expenses', () => {
    expect(expectedDrawerCash({ openingCash: 2000, cashSales: 5400, paidIn: 100, cashPaidOut: 350 })).toBe(7150);
  });
  it('short drawer is negative and needs a reason', () => {
    const v = cashVariance(7000, 7150);
    expect(v).toBe(-150);
    expect(varianceLabel(v)).toBe('Short');
    expect(varianceNeedsReason(v)).toBe(true);
  });
  it('exact drawer needs no reason', () => {
    expect(varianceNeedsReason(cashVariance(7150, 7150))).toBe(false);
  });
  it('net profit subtracts food cost and expenses', () => {
    expect(netProfit({ sales: 10000, foodCost: 3000, expenses: 1500 })).toEqual({ gross: 7000, net: 5500, netMarginPct: 55 });
  });
});
