import { describe, expect, it } from 'vitest';
import { buildReplayArgs, toPaymentEnum } from '@/utils/pendingBillReplay';

const ids = { adminId: 'admin-1', createdBy: 'user-1', branchId: null };
const bill = {
  bill_no: '0042',
  total_amount: 150,
  payment_mode: 'Cash',
  payment_details: { Cash: 150 },
  date: '2026-10-21',
  items: [
    { item_id: 'tea-id', name: 'Tea', quantity: 2, price: 20, total: 40 },
    { item_id: null, name: 'Calci ₹110', quantity: 1, price: 110, total: 110, billing_type: 'calci' },
  ],
};

describe('offline bill replay', () => {
  it('keeps the bill number printed on the customer receipt', () => {
    expect(buildReplayArgs(bill, ids).p_bill_payload.bill_no).toBe('0042');
  });

  it('sends the bill and its lines together in one server request', () => {
    const args = buildReplayArgs(bill, ids);
    expect(args.p_cart_items).toHaveLength(2);
    expect(args.p_cart_items[0]).toMatchObject({ id: 'tea-id', quantity: 2, billing_type: 'pos' });
    expect(args.p_cart_items[1]).toMatchObject({ id: null, billing_type: 'calci' });
  });

  it('uses the signed-in shop, never another tenant', () => {
    const args = buildReplayArgs(bill, ids);
    expect(args.p_bill_payload.admin_id).toBe('admin-1');
    expect(args.p_bill_payload.created_by).toBe('user-1');
  });

  it('maps cashier payment labels to the stored payment types', () => {
    expect(toPaymentEnum('Cash')).toBe('cash');
    expect(toPaymentEnum('split')).toBe('other');
    expect(toPaymentEnum('PhonePe UPI')).toBe('upi');
  });
});
