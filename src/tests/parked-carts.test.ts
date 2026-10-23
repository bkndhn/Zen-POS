import { describe, it, expect } from 'vitest';
import { addParked, removeParked, cartTotal, MAX_PARKED, minutesAgo } from '@/utils/parkedCarts';

const item = (price: number, quantity: number) => ({ price, quantity });

describe('parked carts', () => {
  it('keeps at most 10 parked bills, newest first', () => {
    let list: any[] = [];
    for (let i = 0; i < 12; i++) list = addParked(list, [item(10, 1)], `B${i}`, 1000 + i);
    expect(MAX_PARKED).toBe(10);
    expect(list).toHaveLength(10);
    expect(list[0].note).toBe('B11');
  });

  it('ignores empty carts and zero-quantity lines', () => {
    expect(addParked([], [item(50, 0)], 'x')).toHaveLength(0);
    const list = addParked([], [item(50, 0), item(20, 2)], 'x');
    expect(list[0].items).toHaveLength(1);
    expect(list[0].total).toBe(40);
  });

  it('totals price × quantity to 2 decimals', () => {
    expect(cartTotal([item(12.5, 3), item(0.1, 3)])).toBe(37.8);
  });

  it('removes only the chosen bill', () => {
    let list = addParked([], [item(1, 1)], 'a', 1);
    list = addParked(list, [item(1, 1)], 'b', 2);
    expect(removeParked(list, list[0].id).map((p) => p.note)).toEqual(['a']);
  });

  it('trims the note to 40 characters', () => {
    expect(addParked([], [item(1, 1)], ' ' + 'x'.repeat(60))[0].note).toHaveLength(40);
  });

  it('describes waiting time', () => {
    expect(minutesAgo(0, 30_000)).toBe('just now');
    expect(minutesAgo(0, 5 * 60_000)).toBe('5 min ago');
    expect(minutesAgo(0, 125 * 60_000)).toBe('2 h ago');
  });
});
