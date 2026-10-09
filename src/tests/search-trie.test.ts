import { describe, it, expect } from 'vitest';
import { buildItemTrie } from '@/utils/searchTrie';

const items = [
  { id: '1', name: 'Masala Tea', category: 'Drinks', barcode: '8901234' },
  { id: '2', name: 'Lemon Juice', category: 'Drinks' },
  { id: '3', name: 'Veg Puff', category: 'Snacks' },
];

describe('item search trie', () => {
  it('matches any word prefix', () => {
    expect([...buildItemTrie(items).search('tea')!]).toEqual(['1']);
  });
  it('matches barcode prefix', () => {
    expect([...buildItemTrie(items).search('8901')!]).toEqual(['1']);
  });
  it('requires all words', () => {
    expect(buildItemTrie(items).search('drinks lem')!.size).toBe(1);
  });
  it('searches 5000 items in under 5ms', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), name: `Item ${i} special` }));
    const t = buildItemTrie(many);
    const s = performance.now();
    t.search('spe');
    expect(performance.now() - s).toBeLessThan(5);
  });
});
