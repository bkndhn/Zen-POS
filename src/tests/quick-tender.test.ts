import { describe, it, expect } from 'vitest';
import { discountAmountFor, tenderSuggestions } from '@/utils/quickTender';

describe('quick discount', () => {
  it('5% of 200 is 10', () => expect(discountAmountFor(200, 'percentage', 5)).toBe(10));
  it('10% of 135 is 13.5', () => expect(discountAmountFor(135, 'percentage', 10)).toBe(13.5));
  it('₹50 flat never exceeds subtotal', () => expect(discountAmountFor(30, 'flat', 50)).toBe(30));
});

describe('exact change buttons', () => {
  it('₹135 bill suggests 135, 150, 200, 500, 2000', () =>
    expect(tenderSuggestions(135)).toEqual([135, 150, 200, 500, 2000]));
  it('₹100 bill has no duplicates', () => expect(tenderSuggestions(100)).toEqual([100, 500, 2000]));
  it('nothing due gives no buttons', () => expect(tenderSuggestions(0)).toEqual([]));
});
