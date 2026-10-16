import { describe, it, expect } from 'vitest';
import { grossMarginPct, hourlyProfit, tenderMatrix, billCost } from '@/utils/profitAnalytics';
import { expectedDrawerCash, denominationTotal, cashVariance } from '@/utils/shiftReconciliation';

const at = (h: number) => new Date(2026, 9, 16, h, 15).toISOString();

describe('profit analytics', () => {
  it('gross margin % = (sales - cost) / sales', () => {
    expect(grossMarginPct(1000, 350)).toBe(65);
    expect(grossMarginPct(0, 0)).toBe(0);
  });

  it('hourly profit buckets bills by hour', () => {
    const rows = hourlyProfit([
      { total: 200, paymentMode: 'cash', createdAt: at(13), lines: [{ quantity: 2, purchaseRate: 40 }] },
      { total: 100, paymentMode: 'upi', createdAt: at(13), lines: [{ quantity: 1, purchaseRate: 30 }] },
    ]);
    expect(rows[13]).toMatchObject({ sales: 300, cost: 110, profit: 190, bills: 2 });
    expect(billCost({ total: 0, paymentMode: 'cash', createdAt: at(1), lines: [{ quantity: 3, purchaseRate: 10 }] })).toBe(30);
  });

  it('tender matrix splits split-payments and subtracts cash expenses', () => {
    const t = tenderMatrix([
      { total: 350, paymentMode: 'cash', createdAt: at(10), lines: [] },
      { total: 500, paymentMode: 'other', createdAt: at(11), lines: [], split: { cash: 200, upi: 300 } },
      { total: 100, paymentMode: 'upi', createdAt: at(12), lines: [], due: 100 },
    ], 150);
    expect(t.rows.cash.amount).toBe(550);
    expect(t.rows.upi.amount).toBe(300);
    expect(t.due).toBe(100);
    expect(t.cashInDrawer).toBe(400);
  });
});

describe('shift walk: float + cash sale - cash expense', () => {
  it('Z-Report expected cash matches counted drawer', () => {
    const expected = expectedDrawerCash({ openingCash: 1000, cashSales: 350, cashPaidOut: 150 });
    expect(expected).toBe(1200);
    const counted = denominationTotal({ n500: 2, n100: 2 });
    expect(cashVariance(counted, expected)).toBe(0);
  });
});
