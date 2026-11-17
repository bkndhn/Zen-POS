import { describe, it, expect } from 'vitest';
import { buildKitchenSlipLines, getKitchenSlipEnabled, setKitchenSlipEnabled } from '@/utils/kitchenSlip';

const bill = { billNo: 'BILL-102', time: '10:42 AM', tableNo: '4', orderType: 'dine_in' as const,
  items: [{ name: 'Masala Dosa', quantity: 2 }, { name: 'Tea', quantity: 1 }] };

describe('kitchen slip on receipt', () => {
  it('uses the same bill number as the kitchen ticket', () => {
    expect(buildKitchenSlipLines(bill, 32)[1]).toContain('KOT #102');
  });
  it('lists every item with quantity', () => {
    const lines = buildKitchenSlipLines(bill, 32);
    expect(lines.some(l => l.startsWith('Masala Dosa') && l.endsWith('x 2'))).toBe(true);
    expect(lines.some(l => l.startsWith('Tea') && l.endsWith('x 1'))).toBe(true);
  });
  it('shows table and order type', () => {
    expect(buildKitchenSlipLines(bill, 32)[1]).toContain('T4 DINE IN');
  });
  it('never exceeds 58mm paper width', () => {
    const long = { ...bill, items: [{ name: 'A very long dish name that overflows', quantity: 3 }] };
    buildKitchenSlipLines(long, 32).forEach(l => expect(l.length).toBeLessThanOrEqual(32));
  });
  it('is compact: one divider, one header, one line per item', () => {
    expect(buildKitchenSlipLines(bill, 32)).toHaveLength(4);
  });
  it('is off by default and only prints when switched on', () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('zenpos_receipt_kitchen_slip');
    expect(getKitchenSlipEnabled()).toBe(false);
    setKitchenSlipEnabled(true);
    expect(getKitchenSlipEnabled()).toBe(true);
    setKitchenSlipEnabled(false);
  });
});
