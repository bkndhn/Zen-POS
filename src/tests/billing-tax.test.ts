import { describe, expect, it } from 'vitest';
import {
  calculateBillTaxSummary,
  calculateItemTax,
  isValidGSTIN,
  taxSummaryFromJson,
  taxSummaryToJson,
} from '@/utils/gstCalculator';
import { formatMoney, formatQty, round2 } from '@/utils/formatters';

const item = (over: Partial<Parameters<typeof calculateBillTaxSummary>[0][number]> = {}) => ({
  price: 100,
  quantity: 1,
  total: 100,
  taxRate: 5,
  taxName: 'GST 5%',
  cessRate: 0,
  isTaxInclusive: true,
  ...over,
});

describe('bill tax calculation', () => {
  it('extracts tax from an inclusive price', () => {
    const result = calculateItemTax(105, 5, 0, true);
    expect(round2(result.taxableAmount)).toBe(100);
    expect(round2(result.totalTax)).toBe(5);
    expect(round2(result.totalWithTax)).toBe(105);
  });

  it('adds tax on top of an exclusive price', () => {
    const result = calculateItemTax(100, 18, 0, false);
    expect(round2(result.taxableAmount)).toBe(100);
    expect(round2(result.totalTax)).toBe(18);
    expect(round2(result.totalWithTax)).toBe(118);
  });

  it('splits tax evenly into CGST and SGST', () => {
    const result = calculateItemTax(100, 12, 0, false);
    expect(round2(result.cgst)).toBe(6);
    expect(round2(result.sgst)).toBe(6);
    expect(round2(result.cgst + result.sgst)).toBe(round2(result.totalTax - result.cess));
  });

  it('charges nothing on an exempt line', () => {
    const result = calculateItemTax(250, 0, 0, true);
    expect(result.totalTax).toBe(0);
    expect(result.taxableAmount).toBe(250);
  });

  it('groups a multi-rate bill by tax slab', () => {
    const summary = calculateBillTaxSummary([
      item({ total: 105, taxRate: 5, taxName: 'GST 5%' }),
      item({ total: 105, taxRate: 5, taxName: 'GST 5%' }),
      item({ total: 118, taxRate: 18, taxName: 'GST 18%' }),
    ]);

    expect(summary.entries.length).toBe(2);
    expect(round2(summary.totalTax)).toBe(round2(summary.totalCgst + summary.totalSgst + summary.totalCess));
    expect(round2(summary.totalTaxable + summary.totalTax)).toBe(328);
  });

  it('survives a save/load round trip', () => {
    const summary = calculateBillTaxSummary([item({ total: 118, taxRate: 18, taxName: 'GST 18%' })]);
    const restored = taxSummaryFromJson(taxSummaryToJson(summary));
    expect(round2(restored.totalTax)).toBe(round2(summary.totalTax));
    expect(restored.entries.length).toBe(summary.entries.length);
  });

  it('treats a missing stored summary as zero tax', () => {
    const restored = taxSummaryFromJson(null);
    expect(restored.totalTax).toBe(0);
    expect(restored.entries).toEqual([]);
  });

  it('validates GSTIN format', () => {
    expect(isValidGSTIN('29ABCDE1234F1Z5')).toBe(true);
    expect(isValidGSTIN('BAD-GSTIN')).toBe(false);
  });
});

describe('money and quantity formatting', () => {
  it('always rounds money to two decimals', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(formatMoney(1234.567)).toBe('1234.57');
  });

  it('handles empty and invalid values safely', () => {
    expect(formatMoney(null)).toBe('0.00');
    expect(formatMoney(undefined)).toBe('0.00');
    expect(formatQty(null)).toBeTypeOf('string');
  });
});
