import { describe, it, expect } from 'vitest';
import { buildTableUpiLink } from '@/utils/tableUpiQr';

describe('table UPI self-pay link', () => {
  it('includes exact amount in rupees with 2 decimals and the table', () => {
    const link = buildTableUpiLink({ upiId: 'shop@okaxis', payeeName: 'A1 Fast Food', amount: 450.5, tableNumber: '3' });
    expect(link).toBe('upi://pay?pa=shop%40okaxis&pn=A1%20Fast%20Food&am=450.50&cu=INR&tn=Table%203%20bill');
  });
  it('refuses a missing or invalid UPI ID', () => {
    expect(buildTableUpiLink({ upiId: '', amount: 100, tableNumber: '1' })).toBeNull();
    expect(buildTableUpiLink({ upiId: 'not-an-id', amount: 100, tableNumber: '1' })).toBeNull();
  });
  it('refuses zero or negative amounts', () => {
    expect(buildTableUpiLink({ upiId: 'a@ybl', amount: 0, tableNumber: '1' })).toBeNull();
    expect(buildTableUpiLink({ upiId: 'a@ybl', amount: -5, tableNumber: '1' })).toBeNull();
  });
});
